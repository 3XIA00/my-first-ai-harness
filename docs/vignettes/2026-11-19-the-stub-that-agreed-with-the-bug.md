# The Stub That Agreed With the Bug

**Date**: 2026-11-19
**Authors**: 3XIA00 (human), Saddler 5.5 (claude-opus-5-5)
**Topic**: A test stand-in encoded the same wrong assumption as the code, so the test passed while the page crashed. A real browser and an error screen found it in one round.

## The Discovery

Milestone M1 (ADR-0004) shipped with four green integration tests: a real server, real WebSocket clients, and the real Neon dev database. Then 3XIA00 opened it in Chrome, typed a name, clicked **Join**, and the page went blank.

The server tests were green because the bug wasn't in the server. So Saddler wrote the missing kind of test: render the actual React page in jsdom, click Join, and talk to the real server. To get there, two jsdom gaps had to be filled. jsdom's WebSocket broke under Vitest, so the test swapped in the `ws` client. jsdom also has no `scrollIntoView`, so the test added:

```ts
Element.prototype.scrollIntoView ??= () => {};
```

The test passed, even under StrictMode. The bug didn't reproduce. Along the way the test found two *real* smaller bugs: StrictMode's discarded socket was closed mid-connect, and a `<div>` sat inside an `<ol>`. Both were fixed, but neither explains a blank page. The honest report was "not reproduced," and the one useful thing shipped alongside it was an **error boundary**: if the page crashes, show the error instead of a white screen.

The next round, 3XIA00 pasted the error screen's text:

```
TypeError: destroy is not a function
    at commitHookEffectListUnmount …
```

The aha: in React, a `useEffect` callback's *return value* is its cleanup ("destroy") function. The scroll effect was written without braces:

```tsx
useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
```

so it *returned* whatever `scrollIntoView` returns. The code assumed `undefined`. **Current Chrome returns a Promise.** React stored the Promise as the cleanup, and when StrictMode deliberately unmounted the chat right after joining, it called the Promise as a function and crashed.

And the test's stand-in, `() => {}`, also returned `undefined`. **The stub agreed with the bug.** It didn't merely fail to catch the problem; it encoded the exact false belief that caused it. Changing the stub to behave like the real browser (`return Promise.resolve()`) made all three page tests fail with 3XIA00's exact error message on the old code, and pass with the one-line fix (a block body).

## Why This Matters

Every test double is a claim about the world. A no-op looks like the *absence* of a claim, but `() => {}` asserts "this returns undefined." When the author of the code and the author of the stub are the same mind holding the same assumption, the test can only confirm that assumption. It can never challenge it.

## The Directives at Work

- **Fourth Directive (tests must be meaningful)** was satisfied in letter and violated in effect. The page test was real end-to-end, not a mock asserting itself, except for one line of stub, and that line was where the bug lived. The directive's question, "would this test catch a real bug?", has to be asked of the stubs too.
- **Third Directive (regression per bug)** forced the useful step: proving the new test fails on the old code. That check is what showed the first test was blind (it passed on the buggy code) and that the fixed test sees it (it fails with the same error text 3XIA00 saw).
- **Secondary Directive (surface doubts)**: reporting "not reproduced; here are two real bugs I fixed; here's a tool that will tell us more" instead of claiming the fix bought one more round with the browser, and that round was decisive.

## Lessons Learned

1. **A stub must imitate the real thing, not the author's belief about it.** When filling an environment gap, check what the real API returns *today*. Web APIs change: scroll methods returning Promises is recent.
2. **Make failures reportable before you can explain them.** The error boundary cost twenty lines and turned "the page turned white" into a stack trace naming the exact React phase.
3. **Expression-bodied effects are a trap.** `useEffect(() => expr)` returns `expr`. Use a block body unless you mean to return a cleanup.
4. **Run the regression test against the old code.** A test that has never been seen failing hasn't proven it can.
5. **The human with a real browser is part of the test suite.** Automated tests ran in a simulated browser built on the same assumptions as the code; the real-world check came from 3XIA00.

## Metacognitive Insight

The blind spot wasn't missing coverage; it was *shared* belief. Code and test were written by one mind in one pass, so the test inherited the code's assumptions, and a passing test only meant "consistent with what I already believed." The independent signal came from outside that mind: a real browser, run by a human. When you can't get an independent reviewer for a test, make its stubs answer to the real world rather than to you.
