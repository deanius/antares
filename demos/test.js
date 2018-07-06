// @ts-nocheck

// This file controls what is run when you do npm run demos:test
// See also: demos/index.js - for environment variables
//
// Adding tests:
// A demo file should export a function to be run with config
// The function should return an await-able Promise for its
//    completion (implementing this is fun!)
// Your function should write to the `log` fn it is passed
// By doing so you can assert on console.log output!
// `output` will be a string that should match your console.log
//
// In contrast to RxJS marble tests, very complex assertions
// can be made in a very readable format, and without ever
// needing to write them (thanks Jest snapshots!)
// Example of detecting a subtle bug in the interaction of
// two invocations of a renderer:
// - Snapshot
// + Received
//     ①  🍓  💥
//     ②  🍌  🍌  💥
//     ③  🍉  🍉  🍉  💥
// -   ⑨  🥑  🥑  🥑  🥑  🥑   ④  🍍  🍍  🍍  🍍  💥
// +   ⑨  🥑  🥑  🥑  🥑   ④  🍍  🍍  🍍  🍍  💥
//     ⑤  🍏  🍏  🍏  🍏  🍏  💥
// In this case, the 'cutoff' behavior was as expected, but
// a subtle timing issue caused the interruption to occur
// slightly sooner. In this case, the test did not fail.
// It's best if tests are forgiving at least to 40ms, though
// ideally this should come down to 15ms or less.
const Demos = require("./configs")
const { AntaresProtocol } = require("../src/antares-protocol")

let output = ""
const appendLine = s => {
  output = output + `${s}\n`
}
const append = s => {
  output += s
}
const log = appendLine

jest.setTimeout(30000)
describe("All Demos", () => {
  beforeEach(() => {
    output = ""
  })
  describe("writeFileDemo", () => {
    it("should work synchronously", async () => {
      await runDemo(Demos.writeFileAsFilter)
      expect(output).toMatchSnapshot()
    })

    it("should work asynchronously", async () => {
      await runDemo(Demos.writeFileAsRenderer)
      expect(output).toMatchSnapshot()
    })
  })

  describe("speakUpDemo", () => {
    beforeAll(async () => {
      return await new Promise(resolve => setTimeout(resolve, 200))
    })
    it("should hear overlapping speakings", async () => {
      if (!process.env.CI) {
        const [demoFn, config] = Demos.doubleSpeak || [() => true, {}]

        await demoFn({ AntaresProtocol, config, log })

        // snapshots wont work for tests that sometimes aren't run - Jest says 'obsolete'!
        // test output is too highly variable
        expect(output).toEqual(expectedSpeak)
      }
    })
  })

  describe("concurrentFruit demo", () => {
    it("should run in parallel", async () => {
      await runDemo(Demos.concurrentFruit)
      expect(output).toMatchSnapshot()
    })
    it("should run in series", async () => {
      await runDemo(Demos.serialFruit)
      expect(output).toMatchSnapshot()
    })
    it("should abort in-flight renders in cutoff mode", async () => {
      await runDemo(Demos.freshFruit)
      expect(output).toMatchSnapshot()
    })
    it("should mute/drop new renders in mute mode", async () => {
      await runDemo(Demos.muteFruit)
      expect(output).toMatchSnapshot()
    })
  })

  describe("batchedWriteDemo", () => {
    // these run just for timing info
    it("should run slower without batching", async () => {
      expect.assertions(0)
      await runDemo(Demos.unBatchedWriteFile)
    })
    it("should run utlimately faster with batching", async () => {
      expect.assertions(0)
      await runDemo(Demos.batchedWriteFile)
    })
  })

  describe("cheatCodeDemo", () => {
    it("should run the test", async () => {
      await runDemo(Demos.cheatCode)
      expect(output).toMatchSnapshot()
    })
    it("should run the test interactively", undefined)
  })
})

// snapshots wont work for tests that sometimes aren't run - Jest says 'obsolete'!
// test output is too highly variable
const expectedSpeak = `•
> Processing action: Say.speak("International House of Pancakes")
< Done Processing
•
> Processing action: Say.speak("Starbucks")
< Done Processing
•
•
•
< Done speaking
< Done speaking
`
async function runDemo(demo) {
  const [demoFn, config] = demo
  return await demoFn({ AntaresProtocol, config, log, append });
}

