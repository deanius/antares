import {
  AntaresInit,
  getConfig,
  getUserConfig,
  Observable,
  fromJS,
  iList,
  ReductionError,
  TypeValidationError,
  ParentNotificationError
} from '../../src/antares'
import { minimalConfig } from '../helpers/factories'

const failIfNotRejected = fulfilledValue => {
  throw new Error('Didnt expect to fulfill with: ', fulfilledValue)
}

describe('Antares Instance', () => {
  let Antares
  let config

  before(() => {
    config = minimalConfig
  })

  describe('#agentId', () => {
    it('can be assigned directly', () => {
      const Antares = AntaresInit({ ...config, agentId: '39a3' })
      expect(Antares).to.have.property('agentId')
      expect(Antares.agentId).to.eq('39a3')
    })
    it('will be assigned if not given', () => {
      const Antares = AntaresInit({ ...config })
      expect(Antares).to.have.property('agentId')
      expect(Antares.agentId).to.be.ok
    })
    it('will be assigned to outgoing actions as originAgentId', () => {
      const Antares = AntaresInit({ ...config, agentId: '39a3' })
      return Antares.announce({ type: 'ping' }).then(action => {
        expect(action.meta.antares.originAgentId).to.equal('39a3')
      })
    })
  })

  describe('#parentAgentId', () => {
    const Antares = AntaresInit({ ...config })

    it('is initially not present', () => {
      expect(Antares.parentAgentId).to.not.be.ok
    })
    it('becomes initialized with an Antares.init action', () => {
      Antares.store.dispatch({
        type: 'Antares.init',
        payload: {},
        meta: {
          antares: { parentAgentId: '3310' }
        }
      })
      expect(Antares.parentAgentId).to.eq('3310')
    })
  })

  describe('#announce', () => {
    let Antares
    let reductionCount = 0
    let parentNotifyCount = 0

    let reducers = {
      '404': state => state,
      '501': () => {
        throw new Error('501')
      },
      iListPush: (state = new iList(), payload) => {
        reductionCount = reductionCount + 1
        return state.push(payload)
      }
    }
    const ReducerForKey = key => reducers[key] || reducers.iListPush

    // this is the plugin for how you send that action home, be it
    // via WebSockets, REST, etc..
    const notifyParentAgent = action => {
      parentNotifyCount = parentNotifyCount + 1
      return Promise.resolve()
    }

    before(() => {
      Antares = AntaresInit({
        ...config,
        ReducerForKey,
        notifyParentAgent
      })
    })

    beforeEach(() => {
      reductionCount = 0
      parentNotifyCount = 0
    })

    describe('Dispatch of Action', () => {
      it('should dispatch into this agent\'s store synchronously', () => {
        let announcementPromise = Antares.announce({
          type: 'ping',
          payload: { '200': 'OK' },
          meta: { antares: { key: '200' } }
        })

        expect(reductionCount).to.eq(1)
        // let mocha catch if we return a rejected promise
        return announcementPromise
      })

      it('should call the notifyParentAgent function after a successful dispatch', function() {
        this.skip()

        let announcementPromise = Antares.announce({
          type: 'ping',
          payload: { '200': 'OK' },
          meta: { antares: { key: '200' } }
        }).then(() => {

          // expect(parentNotifyCount).to.equal(1)
          // return expect(announcementPromise).to.be.fulfilled
        })
        return announcementPromise
      })

      describe('Error reducing action into store', () => {
        it('should be turned into a promise rejected with ReductionError', () => {
          let didntThrow
          let announcementPromise = Antares.announce({
            type: 'ping',
            payload: { '501': 'err' },
            meta: { antares: { key: '501' } }
          })
          // this line will be run if announce didn't throw an exception
          didntThrow = true

          return announcementPromise
            .then(failIfNotRejected)
            .catch(ReductionError, e => {
              expect(e).to.be.instanceof(ReductionError)
            })
            .then(() => expect(didntThrow).to.be.ok)
        })
      })

      describe('Error Notifying Parent Agent', () => {
        it('should return a promise rejected with ParentNotificationError', () => {
          const Antares = AntaresInit({
            ...config,
            notifyParentAgent: () => Promise.reject('comm error')
          })

          let announcementPromise = Antares.announce({
            type: 'ping',
            payload: {}
          })

          return announcementPromise
            .then(failIfNotRejected)
            .catch(ParentNotificationError, e => {
              expect(e).to.be.instanceof(ParentNotificationError)
            })
        })
      })
    })
  })
})
