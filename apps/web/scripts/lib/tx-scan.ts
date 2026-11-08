// Guarda estática del incidente 07/11 (pedido de /api/admin colgado 300 s): dentro del callback de db.transaction todo tiene
// que usar el `tx` de la transacción. Una consulta al `db` global (directa o en una función que se llama desde adentro), otra
// db.transaction o auth.api (better-auth usa el db global) piden una segunda conexión mientras la transacción retiene la
// suya: en Vercel el pool tiene 3, así que 3 pedidos así a la vez se traban entre sí para siempre y colgaban la instancia.
// Usa el verificador de TypeScript (resuelve imports, alias e import() dinámicos) y sigue las llamadas de forma transitiva.
import path from "node:path";
import ts from "typescript";

export type TxFinding = { tx: string; fn: string; kind: string; at: string; via: string[] };
export type TxScan = { transactions: number; findings: TxFinding[] };

/** Callbacks diferidos: lo que corre adentro no corre dentro de la transacción. */
const DEFERRED = new Set(["after", "runAfterResponse", "setTimeout", "setImmediate", "queueMicrotask"]);

type Fn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;
const isFn = (n: ts.Node): n is Fn => ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);

function exported(program: ts.Program, file: string, name: string): ts.Symbol | undefined {
  const sf = program.getSourceFile(file);
  if (!sf) return undefined;
  const checker = program.getTypeChecker();
  let out: ts.Symbol | undefined;
  ts.forEachChild(sf, (n) => {
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) out = checker.getSymbolAtLocation(d.name);
  });
  return out;
}

/**
 * Recorre todas las llamadas `db.transaction(cb)` de los archivos incluidos. `srcDir`: sólo se siguen funciones declaradas ahí
 * (no las de node_modules). `dbFile` exporta `db` (y opcionalmente `sqlClient`); `authFile`, si existe, exporta `auth`.
 */
export function scanTransactions(program: ts.Program, opts: { root: string; srcDir: string; dbFile: string; authFile?: string; include: (file: string) => boolean }): TxScan {
  const checker = program.getTypeChecker();
  const dbSym = exported(program, opts.dbFile, "db");
  if (!dbSym) throw new Error(`tx-scan: no encontré el export db en ${opts.dbFile}`);
  const globals = new Set([dbSym, exported(program, opts.dbFile, "sqlClient")].filter((x): x is ts.Symbol => !!x));
  const authSym = opts.authFile ? exported(program, opts.authFile, "auth") : undefined;
  const srcPrefix = opts.srcDir.endsWith(path.sep) ? opts.srcDir : opts.srcDir + path.sep;

  const resolve = (s: ts.Symbol | undefined) => {
    while (s && s.flags & ts.SymbolFlags.Alias) { try { s = checker.getAliasedSymbol(s); } catch { break; } }
    return s;
  };
  const symOf = (n: ts.Node) => resolve(checker.getSymbolAtLocation(n));
  const isGlobal = (n: ts.Node) => { const s = symOf(n); return !!s && globals.has(s); };
  const loc = (n: ts.Node) => { const sf = n.getSourceFile(); return `${path.relative(opts.root, sf.fileName)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`; };
  const inType = (n: ts.Node) => { for (let p = n.parent; p; p = p.parent) { if (ts.isTypeNode(p)) return true; if (ts.isStatement(p) || isFn(p)) return false; } return false; };
  const nameOf = (d: Fn) => (d.name && d.name.getText()) || (ts.isVariableDeclaration(d.parent) ? d.parent.name.getText() : "<anónima>");
  const calleeName = (e: ts.Expression) => (ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "");

  /** Declaraciones (con cuerpo, dentro de src) de lo que se llama o se pasa como función. */
  function decls(e: ts.Expression): Fn[] {
    const out: Fn[] = [];
    const take = (ds: readonly ts.Declaration[] | undefined) => {
      for (const d of ds ?? []) {
        let f: ts.Node = d;
        if ((ts.isVariableDeclaration(d) || ts.isPropertyAssignment(d) || ts.isPropertyDeclaration(d)) && d.initializer && isFn(d.initializer)) f = d.initializer;
        if (isFn(f) && f.body && f.getSourceFile().fileName.startsWith(srcPrefix)) out.push(f);
      }
    };
    take(symOf(ts.isPropertyAccessExpression(e) ? e.name : e)?.declarations);
    if (!out.length) take(checker.getTypeAtLocation(e).getSymbol()?.declarations);
    return out;
  }

  type Hit = { kind: string; at: string; via: string[] };
  const memo = new Map<Fn, Hit[]>();
  function summarize(fn: Fn): Hit[] {
    const done = memo.get(fn);
    if (done) return done;
    const hits: Hit[] = [];
    memo.set(fn, hits); // ciclos: la llamada recursiva ve lo acumulado hasta ahí
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && !inType(n) && !ts.isImportSpecifier(n.parent) && isGlobal(n)) {
        const opens = ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n && n.parent.name.text === "transaction";
        hits.push({ kind: opens ? "abre otra db.transaction" : "usa el db global", at: loc(n), via: [] });
      }
      if (authSym && ts.isPropertyAccessExpression(n) && n.name.text === "api" && symOf(n.expression) === authSym) hits.push({ kind: "auth.api (better-auth usa el db global)", at: loc(n), via: [] });
      if (ts.isCallExpression(n)) {
        if (DEFERRED.has(calleeName(n.expression))) {
          visit(n.expression);
          for (const a of n.arguments) if (!isFn(a)) visit(a);
          return;
        }
        for (const d of decls(n.expression)) {
          if (d === fn) continue;
          const name = nameOf(d);
          d.parameters.forEach((prm, i) => {
            if (!prm.initializer) return;
            let usesDb = false;
            const scan = (x: ts.Node) => { if (ts.isIdentifier(x) && isGlobal(x)) usesDb = true; ts.forEachChild(x, scan); };
            scan(prm.initializer);
            const a = n.arguments[i];
            if (usesDb && (!a || (ts.isIdentifier(a) && a.text === "undefined"))) hits.push({ kind: `usa el db global (falta pasar '${prm.name.getText()}' a ${name})`, at: loc(n), via: [] });
          });
          for (const h of summarize(d)) hits.push({ ...h, via: [`${name}() en ${loc(n)}`, ...h.via] });
        }
      }
      ts.forEachChild(n, visit);
    };
    if (fn.body) visit(fn.body);
    const seen = new Set<string>();
    const unique = hits.filter((h) => { const k = `${h.kind}|${h.at}|${h.via.join(">")}`; return !seen.has(k) && !!seen.add(k); });
    hits.splice(0, hits.length, ...unique);
    return hits;
  }

  let transactions = 0;
  const findings: TxFinding[] = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !opts.include(sf.fileName)) continue;
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "transaction" && isGlobal(n.expression.expression)) {
        transactions++;
        let encl: ts.Node | undefined = n.parent;
        while (encl && !(isFn(encl) && (encl.name || ts.isVariableDeclaration(encl.parent)))) encl = encl.parent;
        const where = encl && isFn(encl) ? nameOf(encl) : "<módulo>";
        const cb = n.arguments[0];
        const bodies = !cb ? [] : isFn(cb) ? [cb] : decls(cb);
        for (const b of bodies) for (const h of summarize(b)) findings.push({ tx: loc(n), fn: where, ...h });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { transactions, findings };
}

/** El programa de apps/web (src, sin pruebas) con su tsconfig. */
export function scanApp(root: string): TxScan {
  const cfg = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  if (cfg.error) throw new Error(ts.flattenDiagnosticMessageText(cfg.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
  const srcDir = path.join(root, "src");
  const include = (f: string) => f.startsWith(srcDir + path.sep) && !/\.test\.tsx?$/.test(f);
  const program = ts.createProgram(parsed.fileNames.filter(include), { ...parsed.options, noEmit: true, incremental: false });
  return scanTransactions(program, { root, srcDir, dbFile: path.join(srcDir, "db/index.ts"), authFile: path.join(srcDir, "server/auth.ts"), include });
}

export const formatFinding = (f: TxFinding) => `${f.tx} (${f.fn}): ${f.kind} en ${f.at}${f.via.length ? ` · vía ${f.via.join(" → ")}` : ""}`;
