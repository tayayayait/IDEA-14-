import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

const viteConfigPath = path.resolve(process.cwd(), "vite.config.ts");

function loadViteConfigObject() {
  const source = fs.readFileSync(viteConfigPath, "utf8");
  const sourceFile = ts.createSourceFile(viteConfigPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let configObject: ts.ObjectLiteralExpression | null = null;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === "defineConfig" &&
      node.arguments.length > 0
    ) {
      const [argument] = node.arguments;
      if (ts.isArrowFunction(argument) && ts.isParenthesizedExpression(argument.body)) {
        const body = argument.body.expression;
        if (ts.isObjectLiteralExpression(body)) {
          configObject = body;
        }
      } else if (ts.isObjectLiteralExpression(argument)) {
        configObject = argument;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!configObject) {
    throw new Error("vite.config.ts defineConfig object was not found");
  }

  return { configObject, sourceFile };
}

function getObjectProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.ObjectLiteralExpression | null {
  const property = objectLiteral.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) &&
      ts.isIdentifier(item.name) &&
      item.name.text === propertyName &&
      ts.isObjectLiteralExpression(item.initializer),
  );

  return property?.initializer ?? null;
}

function getPropertyInitializer(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.Expression | null {
  const property = objectLiteral.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === propertyName,
  );

  return property?.initializer ?? null;
}

describe("vite development server config", () => {
  it("binds a single loopback host and rejects duplicate dev servers on the same port", () => {
    const { configObject, sourceFile } = loadViteConfigObject();
    const server = getObjectProperty(configObject, "server");
    const optimizeDeps = getObjectProperty(configObject, "optimizeDeps");

    expect(getPropertyInitializer(server!, "host")?.getText(sourceFile)).toBe('"127.0.0.1"');
    expect(getPropertyInitializer(server!, "strictPort")?.getText(sourceFile)).toBe("true");
    expect(getPropertyInitializer(optimizeDeps!, "force")?.getText(sourceFile)).toBe("true");
  });
});
