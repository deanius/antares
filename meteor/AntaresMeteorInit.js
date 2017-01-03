import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'
import Rx from 'rxjs'

// allow consumers of the meteor package to skip having the npm dep as well
export * from '../src/antares'

export const newId = () => {
  return Random.id()
}

const remoteActions = new Rx.Subject

// Defines the upstream (aka server) implementation of dispatch which:
//   dispatches to local store
//   acks the client
//   and that is all.
// The publication of the dispatched, and consequent actions is done by a final middleware
// that runs after the epic middleware to ensure that every listener potentially can hear
export const defineDispatchEndpoint = (store) => {
  Meteor.methods({
    'antares.dispatch': (action) => {
      store.dispatch(action)
      remoteActions.next(action)
    }
  })
}

// Defines the proxy (aka stub) which dispatches locally
export const defineDispatchProxy = () => (action) => {
  // we dont dispatch localOnly actions over the wire
  if (action.meta && action.meta && action.meta.antares && action.meta.antares.localOnly) {
    return
  }

  return new Promise((resolve, reject) => {
    Meteor.call('antares.dispatch', action, (err, result) => {
      if (err) return reject(err)
      resolve(result)
    })
  })
}

// Exposes client-side DDP events as Antares actions
const defineRemoteActionsConsumer = () => {
  const action = new Rx.Subject

  Meteor.connection._stream.on('message', messageJSON => {
    action.next(messageJSON)
  })

  Meteor.subscribe('Antares.remoteActions')
  const action$ = action
    .map(JSON.parse)
//    .filter(ddpMessageToSubType)
    .filter(msg => msg.collection === 'Antares.remoteActions')
    .map(msg => msg.fields)
    .asObservable()

  return action$
}

// Meteor.publish function
const publishToEachClient = function() {
  let client = this
  // TODO don't dispatch originator's action
  // this.added('Antares.remoteActions', newId(), {TODO: 'publish real actions'})
  remoteActions.subscribe(action => {
    client.added('Antares.remoteActions', newId(), action)
  })

  client.ready()
}

// The remoteActionsProducer
const defineRemoteActionsProducer = () => {
  Meteor.publish('Antares.remoteActions', publishToEachClient)
}

const mergeReducer = (state, action) => state.merge(action.payload)
const appendReducer = (state, action) => state.push(action.payload)

// The default antares init function
// Returns: an modified version of the initializer passed, extending its props with ours
export const AntaresMeteorInit = (antaresInit) => {
  return (AntaresConfig) => {
    const meteorArgs = {
      antaresWrapper: 'meteor',
      newId,
      defineDispatchProxy,
      defineDispatchEndpoint,
      defineRemoteActionsProducer,
      defineRemoteActionsConsumer
    }

    // Define default agency names 'any', 'server' and 'client' for familiarity within Meteor
    if (!AntaresConfig.Agents) AntaresConfig.Agents = {}
    Object.assign(AntaresConfig.Agents, {
      server: () => Meteor.isServer,
      client: () => Meteor.isClient,
      any: () => true
    })

    if (!AntaresConfig.ReducerForKey) AntaresConfig.ReducerForKey = (key) => mergeReducer

    console.log('Initializing deanius:antares meteor interface.')
    let antares = antaresInit({ ...AntaresConfig, ...meteorArgs })
    return antares
  }
}
