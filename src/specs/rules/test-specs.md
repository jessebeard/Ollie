This is a file to create a set of rules for the project's tests. 

# Test Specs

1. All tests should be written in JavaScript, using the project's bespoke testing framework. There should be a working test.html file that can be run in a browser to run all the tests, as well as a node script to run all the tests.

2. Test code should be self-documenting and easy to understand. The testing framework should support this with descriptive test names and behaviors.

3. The actual syntax of the tests should both describe the behavior of the code and test it. Reading the top level describe block should give an understanding of the aspect of the feature being tested.

4. Tests should be written so that they test the behavior of the feature, not the implementation. If the implementation changes, the tests should not need to be changed. Property based testing should be used to test the behavior of the feature. Expanding the Testing framework to support a more robust test is encouraged where appropriate. 

5. Tests should be written in a way that they can be run in parallel. Testing framework should support parallel execution.

6. Test logic should be isolated from the code it is testing. 

7. Tests should avoid using the DOM.  

8. Code coverage: 100%. The tests should predict all possible outcomes of the code they are testing. Our software should be deterministic and testable. 

9. The tests are ultimately not just a form of documentation, but a form of specification. A blueprint of the project, providing the ground truth of the project's behavior.
 
10. Testing should include software that tests the tests, mutation testing, a fuzz testing harness, and counterexample based testing.

11. All tests must have environment parity. Adding a test requires it to be added to both \`test/runner.js\` (CLI) and \`test.html\` (Browser). No tests should be exclusively runnable in only one environment unless intrinsically tied to an environment-specific feature (e.g. DOM manipulation, node.js file system API).

12. **Mutation-Killing Assertion Strength**: Every assertion must constrain a specific, observable value — not merely assert non-failure. A test that only checks "it didn't throw" or "the output exists" is insufficient; if a source line were mutated (e.g., `+` changed to `-`, a constant altered, a branch flipped), at least one assertion in the suite must fail. Property-based tests must assert on the *content and structure* of results (e.g., byte-level equality, length invariants, algebraic identities), not just their type or existence, so that automated mutation testing can verify test suite thoroughness.

13. **PBT Generator Bounding**: Property-based test generators (e.g. `Arbitrary.byteArray()`) must be explicitly bounded to respect the mathematical and physical capacity limits of the algorithms they test (e.g., maximum steganography payload capacities within mock image dimensions). Fuzzing inputs should target the algebraic properties seamlessly rather than blindly feeding arbitrarily large data that guarantees systemic memory or threshold exhaustion, unless explicitly testing boundary rejections.
