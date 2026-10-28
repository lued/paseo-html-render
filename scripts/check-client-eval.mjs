#!/usr/bin/env node
/** Real Hermes entry/setup regression. Synthetic unmounted UI is NOT device evidence. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { assertNoClientClasses } from "./client-syntax.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argument = process.argv.indexOf("--hermes");
const binary = argument < 0 ? process.env.PASEO_HTML_RENDER_HERMES : process.argv[argument + 1];
assert.ok(binary, "Provide --hermes <real Hermes VM executable> or PASEO_HTML_RENDER_HERMES; compiler-only hermesc is insufficient");
const hermes = resolve(binary);
const common = { bundle: true, platform: "neutral", mainFields: ["module", "main"],
  target: "es2020", supported: { "async-await": false }, write: false, logLevel: "silent" };
const client = await build({ ...common, absWorkingDir: root, entryPoints: ["index.client.tsx"],
  format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime", "react-native",
    "@getpaseo/plugin", "@getpaseo/plugin/server", "@getpaseo/plugin/server/provider",
    "@getpaseo/plugin/server/usage", "@getpaseo/plugin/server/acp",
    "@getpaseo/plugin/client", "@getpaseo/plugin/client/ui",
    "@getpaseo/plugin/client/react-native", "@tanstack/react-query", "zod"] });
const code = client.outputFiles[0].text;
assertNoClientClasses(code);
// Same public CommonJS factory/eager interop contract as the pinned host compiler.
const bundleArgument = process.argv.indexOf("--bundle");
const delivered = bundleArgument < 0
  ? "(function(require){\nconst module={exports:{}};const exports=module.exports;\n" +
    code.replaceAll("get: () => from[key]", "value: from[key]") + "\nreturn module.exports;\n})"
  : await readFile(resolve(process.argv[bundleArgument + 1]), "utf8");
assertNoClientClasses(delivered);
const host = await build({ ...common, stdin: { resolveDir: root,
  contents: 'import * as R from "react";import * as J from "react/jsx-runtime";import * as Z from "zod";import * as P from "@getpaseo/plugin";export {R,J,Z,P};' },
  define: { "process.env.NODE_ENV": '"production"' }, format: "iife", globalName: "__host" });
const sentinel = "return module.exports;";
assert.equal(delivered.split(sentinel).length, 2, "expected one outer return for separately instrumented construction check");
const nativeCheck = `module.exports.__nativeCheck=function(nativeHost){
 var catalog=new ArtifactCatalog(),other=new ArtifactCatalog();
 catalog.beginGeneration();
 if(catalog.currentGeneration!==1||other.currentGeneration!==0)throw Error("catalog generation/instance isolation");
 if(catalog.noteGap("owned","streaming")||!catalog.noteGap("owned","complete")||catalog.noteGap("owned","complete"))throw Error("catalog gap policy");
 if(catalog.gapCount!==1||!catalog.takeDirty()||catalog.takeDirty())throw Error("catalog getters/dirty");
 var session="hermes-fixture-session",assembler=new NativeChunkAssembler(session);
 var encoded=encodeURIComponent(JSON.stringify({value:"Unicode 😀 漢字",n:287}));
 var cut=Math.floor(encoded.length/2),a={messageId:1,sequence:0,total:2,data:encoded.slice(0,cut)},b={messageId:1,sequence:1,total:2,data:encoded.slice(cut)};
 if(!assembler.push(a).ok||assembler.complete||!assembler.push(a).duplicate||!assembler.push(b).ok||!assembler.complete)throw Error("assembler ordering");
 var decoded=decodeNativeTransportMessage(assembler.takeEncoded());
 if(!decoded.ok||decoded.value.n!==287||assembler.lastCompleted!==1||assembler.sessionId!==session||!assembler.push(b).duplicate)throw Error("assembler completion/replay");
 var Boundary=getNativeErrorBoundary(),caught="";
 if(typeof Boundary!=="function")throw Error("boundary missing");
 var boundary=new Boundary({onError:function(message){caught=message;},children:"owned-child"});
 if(boundary.state.error!==null||boundary.render()!=="owned-child"||!boundary.isReactComponent)throw Error("boundary construction");
 boundary.state=Boundary.getDerivedStateFromError(Error("owned failure"));
 if(boundary.render()!==null)throw Error("boundary containment");
 boundary.componentDidCatch();if(!caught)throw Error("boundary error reporting");
 var oldHost=nativeHtmlCapability("android");
 if(!oldHost.available||oldHost.reason!=="ready")throw Error("legacy missing-DocumentFrame registered-WebView capability");
 if(reportCardMode({platform:"android",renderMode:"auto",hasHtml:true,hasReport:false,nativeAvailable:oldHost.available})!=="native")throw Error("legacy native selection");
 nativeHost.UIManager.hasViewManagerConfig=function(){return false;};
 var unavailable=nativeHtmlCapability("android");
 if(unavailable.available||unavailable.reason!=="host-native-view")throw Error("missing native view must fail closed");
 if(!/registered native WebView manager/.test(nativeFallbackMessage(unavailable.reason)))throw Error("fallback reason");
 nativeHost.UIManager.hasViewManagerConfig=function(name){return name==="RNCWebView";};
 if(NATIVE_WEBVIEW_SECURITY_PROPS.messagingEnabled!==true)throw Error("native security");
 return true;
};
module.exports.__capability=function(){return nativeHtmlCapability("android");};\n`;
const instrumented = delivered.replace(sentinel, nativeCheck + sentinel);
const program = `
function must(value,message){if(!value)throw Error(message);}
var Dummy=function(){};
var native={View:Dummy,Text:Dummy,Pressable:Dummy,Image:Dummy,StyleSheet:{create:function(value){return value;}},UIManager:{dispatchViewManagerCommand:Dummy,hasViewManagerConfig:function(name){return name==="RNCWebView";}},findNodeHandle:function(){return 1;}};
var modal=Dummy;modal.Content=Dummy;
var legacyUi={SettingsGroup:Dummy,SettingsSection:Dummy,SettingsCard:Dummy,SettingsRow:Dummy,SettingsSwitch:Dummy,SettingsSelect:Dummy,SettingsInput:Dummy,SettingsAction:Dummy,ExternalLink:Dummy,SidebarRow:Dummy,SidebarSeparator:Dummy};
var legacyRn={Icon:Dummy,Modal:modal,ScrollView:Dummy,FlatList:Dummy,TextInput:Dummy,copyText:Dummy,useToast:Dummy,useRevealedText:Dummy};
var modules={react:__host.R,"react/jsx-runtime":__host.J,"react-native":native,zod:__host.Z,"@getpaseo/plugin":__host.P,"@getpaseo/plugin/client":{},"@getpaseo/plugin/client/ui":legacyUi,"@getpaseo/plugin/client/react-native":legacyRn,"@tanstack/react-query":{}};
function requireHost(name){must(Object.prototype.hasOwnProperty.call(modules,name),"unexpected module");return modules[name];}
function setup(source){
 var factory=(0,eval)(source);must(typeof factory==="function","factory missing");
 var value=factory(requireHost);must(typeof value.default==="function","entry missing");
 var registrations=[];
 var cleanup=value.default({addTimelineTransformer:function(){registrations.push("transformer");return Dummy;},addScreen:function(){registrations.push("screen");},addTimelineRenderer:function(){registrations.push("renderer");},openScreen:Dummy});
 must(registrations.join(",")==="transformer,screen,renderer"&&typeof cleanup==="function","setup incomplete");cleanup();return value;
}
setup(${JSON.stringify(delivered)});
print("HERMES_ENTRY_OK");
var inspected=setup(${JSON.stringify(instrumented)});
must(inspected.__nativeCheck(native)===true,"native construction incomplete");
print("HERMES_NATIVE_OK");
var modernUi=Object.assign({},legacyUi,legacyRn,{DocumentFrame:Dummy});
modules["@getpaseo/plugin/client/ui"]=modernUi;
modules["@getpaseo/plugin/client/react-native"]=modernUi;
setup(${JSON.stringify(delivered)});
var modern=setup(${JSON.stringify(instrumented)});
must(modern.__capability().available,"0.14 selection missing");
native.UIManager.hasViewManagerConfig=function(){return false;};
must(!modern.__capability().available&&modern.__capability().reason==="host-native-view","0.14 export overrode missing native manager");
delete native.UIManager.hasViewManagerConfig;
must(modern.__capability().available,"0.14 public export without optional manager query");
native.UIManager.hasViewManagerConfig=function(){return true;};
native.UIManager.dispatchViewManagerCommand=undefined;
must(!modern.__capability().available&&modern.__capability().reason==="command-apis","missing command API must fail closed");
print("HERMES_HOST_MATRIX_OK");
`;
const directory = await mkdtemp(join(tmpdir(), "hr-hermes-"));
try {
  await chmod(directory, 0o700);
  const path = join(directory, "client-eval.js");
  await writeFile(path, host.outputFiles[0].text.replaceAll("get: () => from[key]", "value: from[key]") + "\n" + program, { mode: 0o600 });
  const options = { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: directory, LANG: "C.UTF-8" } };
  const version = execFileSync(hermes, ["--version"], options).trim();
  const output = execFileSync(hermes, ["-Xes6-class", "-enable-eval", "-w", path], options);
  assert.match(output, /^HERMES_ENTRY_OK$/m);
  assert.match(output, /^HERMES_NATIVE_OK$/m);
  assert.match(output, /^HERMES_HOST_MATRIX_OK$/m);
  console.log(JSON.stringify({ result: "pass", clientSha256: createHash("sha256").update(delivered).digest("hex"),
    clientBytes: Buffer.byteLength(delivered), engineVersion: version, entrySetup: true, nativeConstruction: true,
    hostProfiles: ["legacy-separate-ui-no-DocumentFrame", "0.14-unified-ui"], hostNegativeCases: true,
    uiEvidence: "synthetic-unmounted; NOT Android/Fabric/WebView evidence" }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
