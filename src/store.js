import { applyMiddleware, compose, createStore, combineReducers } from 'redux'
import { createEpicMiddleware, combineEpics } from 'redux-observable'
import { fromJS, Map as iMap } from 'immutable'
// immutablediff -  RFC 6902 diff as immutable List
// mongodb-diff - mongo operator
import iDiffer from 'immutablediff'
import { diff as mongoDiffer } from 'mongodb-diff'
import Rx from 'rxjs/Rx'
import { Epics, ReducerForKey, ViewReducer, DispatchProxy, NewId } from './config'
import { inAgencyRun, isInAgency } from './agency'
import { AntaresError } from './errors'
import { enhanceActionMeta } from './action'

// handles storing, updating, and removing
export const antaresReducer = (state, action) => {
    if (!state) return new iMap()

    // these are up to the client to manage - we perform no change
    if (action.type.startsWith('View.')) return state

    let { type, payload, meta } = action

    let { antares } = (meta || {})
    let providedKey = (antares || {}).key
    let providedKeyPath = [].concat(providedKey)

    // Fail if record cant be stored at this key
    if (type === 'Antares.store') {
        // provide an ID if they haven't
        let keyPath = providedKey ? providedKeyPath : [ NewId[0]() ]

        // OVERWRITE WHAT WAS THERE BEFORE
        // Justification being: if the server tells you to do it, you should do it
        return state.setIn(keyPath, fromJS(payload))
    }

    // An antares or other update which should target a specific key
    if (type === 'Antares.update' || providedKey) {
        if (! state.hasIn(providedKeyPath)) throw new AntaresError(`Antares.update: Store has no value at ${providedKeyPath}`)

        let reducer = ReducerForKey[0](providedKey)
        return state.updateIn(providedKeyPath, state => reducer(state, action))
    }

    if (type === 'Antares.init') {
      return fromJS(action.payload)
    }

    return state
}

// A utility function which incorporates Redux DevTools and optional middleware
const makeStoreFromReducer = (reducer, middleware) => {
    let composeEnhancers = compose

    // in browsers override compose to hook in DevTools
    inAgencyRun('client', function() {
      if ( typeof window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ === 'function')
        composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
    })

    return createStore(reducer, composeEnhancers(
        applyMiddleware(...middleware)
    ))
}

const dispatchToServer = (action) => {
  if( isInAgency('client') ) {
    let dispatchProxy = DispatchProxy[0]
    dispatchProxy.call(null, action)
  }
}

const _diff$ = new Rx.Subject

const diffMiddleware = store => next => action => { 
  const preState = store.getState().antares
  next(action) // reduce / dispatch it
  const postState = store.getState().antares

  // TODO could measure and do most performant
  const iDiffList = iDiffer(preState, postState)
  const iDiff = iDiffList.size > 0 ? iDiffList.toJS() : null


  let key = action.meta && action.meta.antares && action.meta.antares.key
  let collection = key && key.length === 2 && key[0]
  let id = key instanceof Array ? key[key.length - 1] : key

  let _mongoDiff
  if (action.type === 'Antares.store') {
    _mongoDiff = {
      collection,
      id,
      upsert: true,
      doc: action.payload
    }
  } else if (!action.type.startsWith('View.') && action.meta && action.meta.antares && action.meta.antares.key) {
    let before = preState.getIn(action.meta.antares.key).toJS()
    let after  = postState.getIn(action.meta.antares.key).toJS()
    _mongoDiff = {
      collection,
      id,
      update: true,
      updateOp: mongoDiffer(before, after)
    }
  }

  const rawDiff = (_mongoDiff && Object.keys(_mongoDiff).length > 0) ? _mongoDiff : null
  const mongoDiff = rawDiff

  _diff$.next({ action, iDiff, mongoDiff })
}

export const initializeStore = () => {
  const userEpics = Object.values(Epics)

  // To each userEpic we append our own behaviors
  const antaresEnhancedEpics = userEpics.map(userEpic => {
    return (action$, state) =>
      userEpic(action$, state)
        .map(enhanceActionMeta)
        .do(dispatchToServer)
  })

  const rootEpic = combineEpics(...antaresEnhancedEpics)
  const epicMiddleware = createEpicMiddleware(rootEpic)

  const viewReducer = ViewReducer[0]
  const rootReducer = combineReducers({
      antares: antaresReducer,
      view: viewReducer
  })
  
  // Each middleware recieves actions produced by the previous
  const store = makeStoreFromReducer(rootReducer, [
    epicMiddleware,
    diffMiddleware
  ])
  console.log('Initialized Antares store')

  // Give the store magical observable properties
  return Object.assign(store, {
    diff$: _diff$.asObservable()
  })
}
