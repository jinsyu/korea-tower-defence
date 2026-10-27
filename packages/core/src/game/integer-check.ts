// Test helper: finds float use in a game rules file (D17 code check, shared by waves and progress).
// Game values must be BigInt. Plain numbers are allowed only inside `indexFunctions` (table positions),
// and BigInt -> number (`Number(...)`) only as a direct argument to one of `numberInto`.
import ts from "typescript";

export type IntegerCheckOptions = {
  /** Functions that work on table positions (safe integers that never hold a game value). */
  indexFunctions: ReadonlySet<string>;
  /** Functions whose arguments may be `Number(bigint)`. */
  numberInto: ReadonlySet<string>;
};

const FLOAT_NAMES = new Set(["Math", "parseFloat", "toFixed", "toPrecision", "Infinity", "NaN", "EPSILON"]);
const FLOAT_OPS = new Set([
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
]);
// Arithmetic and assignment operators (comparisons are fine on any type).
const ARITHMETIC = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.LessThanLessThanToken,
  ts.SyntaxKind.GreaterThanGreaterThanToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
  ts.SyntaxKind.AmpersandToken,
  ts.SyntaxKind.BarToken,
  ts.SyntaxKind.CaretToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ...FLOAT_OPS,
]);

/** Every float-looking use in `file`, as "code (line n)". Empty when the file is integers only. */
export function findFloatUse(file: string, { indexFunctions, numberInto }: IntegerCheckOptions): string[] {
  const program = ts.createProgram([file], {
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
    allowImportingTsExtensions: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file)!;
  const found: string[] = [];
  const isBigInt = (node: ts.Expression) => (checker.getTypeAtLocation(node).flags & ts.TypeFlags.BigIntLike) !== 0;
  const isNumber = (node: ts.Expression) => (checker.getTypeAtLocation(node).flags & ts.TypeFlags.NumberLike) !== 0;
  const isNumberCall = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Number";
  const isAllowedNumberArg = (node: ts.Node) =>
    ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression) && numberInto.has(node.parent.expression.text);

  const visit = (node: ts.Node, fn: string | undefined) => {
    const at = () => `${node.getText(source)} (line ${source.getLineAndCharacterOfPosition(node.getStart()).line + 1})`;
    const inIndexFn = fn !== undefined && indexFunctions.has(fn);
    if (ts.isNumericLiteral(node) && /[.eE]/.test(node.getText(source))) found.push(at());
    if (ts.isIdentifier(node) && FLOAT_NAMES.has(node.text)) found.push(at());
    if (ts.isBinaryExpression(node) && FLOAT_OPS.has(node.operatorToken.kind) && !(isBigInt(node.left) && isBigInt(node.right)))
      found.push(at());
    if (ts.isBinaryExpression(node) && ARITHMETIC.has(node.operatorToken.kind) && (isNumber(node.left) || isNumber(node.right)) && !inIndexFn)
      found.push(at());
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && isNumber(node.operand) && !inIndexFn)
      found.push(at());
    if (isNumberCall(node) && !isAllowedNumberArg(node)) found.push(at());
    const name = ts.isFunctionDeclaration(node) ? node.name?.text : fn;
    ts.forEachChild(node, (child) => visit(child, name));
  };
  visit(source, undefined);
  return found;
}
