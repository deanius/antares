// @ts-nocheck
import { Agent, agentConfigFilter, randomIdFilter } from "../src/antares-protocol"
import { init } from "@rematch/core"
import { triviaStoreConfig } from "../demos/trivia/store"
describe("Multi-agent Trivia Game", () => {
  let moderator: Agent // the server
  let player1: Agent // a player
  let emcee: Agent // the real-life game operator
  const pantsQ = { prompt: "Pants?", choices: ["Yes", "No"] }
  const pantsA = { answer: "No" }

  beforeAll(() => {
    moderator = new Agent({ agentId: "moderator", relayActions: true })
    player1 = new Agent({ agentId: "player1" })
    emcee = new Agent({ agentId: "emcee" })

    // The topology defines who sends actions to whom
    const topology = {
        player1: [moderator],
        emcee: [moderator],
        moderator: [player1, emcee]
      }

      // Set up agents' properties and relationships to each other
    ;[moderator, player1, emcee].forEach(agent => {
      // All agents have a store
      const store = init(triviaStoreConfig)
      agent.addFilter(({ action }) => store.dispatch(action))
      // Expose for testing only!
      Object.assign(agent, { store })
      Object.defineProperty(store, "state", {
        get() {
          return this.getState()
        }
      })

      // Stamp actions with agentConfig
      agent.addFilter(agentConfigFilter(agent))
      agent.addFilter(randomIdFilter())

      // Agents send actions to the others in their topology
      const others = topology[agent.agentId]
      agent.addFilter(({ action }) => {
        const meta = action.meta || {}

        // Actions marked meta.push false are not even sent to the server
        if (meta["push"] === false) return

        // We send out actions to others but tell them not to push them
        others.forEach(targetAgent => {
          // TODO Dont send back the way we came. Requires agentConfigFilter
          targetAgent.process({
            ...action,
            meta: {
              ...(action.meta || {}),
              // Except, we can tell the moderator to push to all others
              // This will change once diffs of the store are filtered and
              // pushed, instead of the actions that caused them.
              push: targetAgent.relayActions ? true : false
            }
          })
        })
      })
    })
  })

  it.only("should play the whole game without error", () => {
    // set up questions
    player1.process({ type: "game/addQuestion", payload: pantsQ })
    expect(moderator.store.state.game).toMatchObject({
      questions: [pantsQ]
    })
    // players join
    player1.process({ type: "game/joinPlayer", payload: { name: "Declan" }, meta: { push: true } })
    const joinedState = {
      players: [{ name: "Declan" }]
    }
    expect(moderator.store.state.game).toMatchObject(joinedState)
    expect(moderator.store.state.game).toMatchObject(joinedState)

    // begin game
    emcee.process({ type: "game/nextQuestion", payload: pantsQ, meta: { push: true } })
    const roundUnanswered = (hideAnswers = false) => ({
      game: {
        status: "playing",
        questions: []
      },
      round: {
        question: Object.assign(pantsQ, hideAnswers ? {} : pantsA)
      }
    })
    expect(moderator.store.state).toMatchObject(roundUnanswered())
    expect(player1.store.state).toMatchObject(roundUnanswered())
    // players answer when the round changes

    const playerAnswer = { from: player1.agentId, choice: "No" }
    const filteredAction = player1.process({
      type: "round/respond",
      payload: playerAnswer
    })
    expect(filteredAction.meta).toMatchObject({ agentId: "player1" })
    expect(player1.store.state.round.responses).toContain(playerAnswer)
    expect(moderator.store.state.round.responses).toContain(playerAnswer)
    expect(moderator.store.state.round.summary).toMatchObject({ Yes: 0, No: 1 })

    // Once the next question is chosen by the emcee, saveResponses
    // will process just prior to nextQuestion
    const clearedIt = emcee.process({
      type: "root/saveResponses",
      payload: playerAnswer
    })
    expect(emcee.store.state.game.responses).toContain(playerAnswer)
    const nextedIt = emcee.process({
      type: "game/nextQuestion",
      payload: pantsQ
    })
    expect(emcee.store.state.round.question).toMatchObject(pantsQ)
    expect(emcee.store.state.round.responses).toHaveLength(0)
  })
})
