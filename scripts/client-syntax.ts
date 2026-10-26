import assert from "node:assert/strict";
import ts from "typescript";

/** Check syntax, not words in HTML strings/comments inside the bundle. */
export function assertNoClientClasses(code: string): void {
  const source = ts.createSourceFile("client.cjs", code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const visit = (node: ts.Node): void => {
    assert.ok(!ts.isClassExpression(node) && !ts.isClassDeclaration(node),
      "client bundle must be class-free for Hermes eval initialization");
    ts.forEachChild(node, visit);
  };
  visit(source);
}
