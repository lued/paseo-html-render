/**
 * Generated from pele 1.7.0, flowchart only. Do not edit.
 * Rebuild: node scripts/vendor-pele.mjs
 * Upstream https://github.com/obsidianmd/pele, MIT. See LICENSE.pele beside this file.
 */

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// node_modules/pele/dist/esm/chunks/EJ5KOXYD.js
var g = class {
  constructor(t) {
    __publicField(this, "message");
    this.message = t;
  }
};
var S = 64;
function Y(e2, t, l4) {
  t === "__proto__" ? Object.defineProperty(e2, t, { value: l4, enumerable: true, writable: true, configurable: true }) : e2[t] = l4;
}
var y = class {
  constructor(t) {
    __publicField(this, "lines");
    __publicField(this, "i", 0);
    this.lines = t.replace(/\r\n?/g, `
`).split(`
`);
  }
  skipBlank() {
    for (; this.i < this.lines.length; ) {
      let t = this.lines[this.i].trim();
      if (t !== "" && t[0] !== "#" && t !== "---") break;
      this.i++;
    }
  }
  indent() {
    let t = this.lines[this.i], l4 = 0;
    for (; l4 < t.length && t[l4] === " "; ) l4++;
    if (t[l4] === "	") throw new Error("YAML: tabs are not allowed for indentation");
    return l4;
  }
};
var _ = /^[-+]?(?:0|[1-9][0-9]*)$/;
var v = /^[-+]?0x[0-9a-fA-F]+$/;
var R = /^[-+]?0o[0-7]+$/;
var B = /^[-+]?0b[01]+$/;
var C = /^[-+]?(?:[0-9][0-9]*(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/;
var O = /[\s#:,[\]{}&*!|>'"%@`]/;
function b(e2) {
  return e2 === " " || e2 === "	" || e2 === `
` || e2 === "\r";
}
function A(e2) {
  let t = e2[0], l4, n2;
  if (t === '"' || t === "'") {
    let r2 = 1;
    for (; ; ) {
      if (r2 >= e2.length) return null;
      let i5 = e2[r2];
      if (t === '"' && i5 === "\\") r2 += 2;
      else if (i5 === t) {
        if (t === '"' || e2[r2 + 1] !== "'") break;
        r2 += 2;
      } else r2++;
    }
    for (l4 = r2 + 1, n2 = l4; b(e2[n2]); ) n2++;
    if (e2[n2] !== ":") return null;
  } else {
    if (t === void 0 || O.test(t) || t === "-" && (e2.length < 2 || b(e2[1]) || e2[1] === ":" || e2[1] === "#")) return null;
    for (n2 = 1; n2 < e2.length && e2[n2] !== ":" && e2[n2] !== "#"; ) n2++;
    if (e2[n2] !== ":") return null;
    for (l4 = n2; b(e2[l4 - 1]); ) l4--;
  }
  let s3 = n2 + 1;
  if (s3 < e2.length && !b(e2[s3])) return null;
  for (; b(e2[s3]); ) s3++;
  return { key: e2.slice(0, l4), length: s3 };
}
function V(e2) {
  let t = e2.trim();
  if (t === "" || t === "~" || t === "null" || t === "Null" || t === "NULL") return null;
  if (t === "true" || t === "True" || t === "TRUE") return true;
  if (t === "false" || t === "False" || t === "FALSE") return false;
  if (_.test(t) || C.test(t)) return Number(t);
  if (v.test(t) || R.test(t) || B.test(t)) {
    let l4 = t[0] === "-", n2 = Number(l4 || t[0] === "+" ? t.slice(1) : t);
    return l4 ? -n2 : n2;
  }
  return /^[-+]?\.(?:inf|Inf|INF)$/.test(t) ? t[0] === "-" ? -1 / 0 : 1 / 0 : /^\.(?:nan|NaN|NAN)$/.test(t) ? NaN : t;
}
var M = { 0: "\0", a: "\x07", b: "\b", t: "	", n: `
`, v: "\v", f: "\f", r: "\r", e: "\x1B", " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\x85", _: "\xA0", L: "\u2028", P: "\u2029" };
function E(e2) {
  if (!e2.includes(`
`)) return e2;
  let t = e2.split(`
`), l4 = t.length - 1;
  for (let n2 = 0; n2 <= l4; n2++) {
    let s3 = t[n2], r2 = 0, i5 = s3.length;
    if (n2 > 0) for (; r2 < i5 && (s3.charCodeAt(r2) === 32 || s3.charCodeAt(r2) === 9); ) r2++;
    if (n2 < l4) for (; i5 > r2 && (s3.charCodeAt(i5 - 1) === 32 || s3.charCodeAt(i5 - 1) === 9); ) i5--;
    t[n2] = s3.slice(r2, i5);
  }
  return t.join(`
`).replace(/\n+/g, (n2) => n2.length === 1 ? " " : `
`.repeat(n2.length - 1));
}
function T(e2) {
  let t = "", l4 = E(e2.replace(/\\\n[ \t]*/g, ""));
  for (let n2 = 0; n2 < l4.length; n2++) {
    let s3 = l4[n2];
    if (s3 !== "\\") {
      t += s3;
      continue;
    }
    let r2 = l4[++n2];
    if (r2 === "x" || r2 === "u" || r2 === "U") {
      let i5 = r2 === "x" ? 2 : r2 === "u" ? 4 : 8;
      t += String.fromCodePoint(parseInt(l4.slice(n2 + 1, n2 + 1 + i5), 16)), n2 += i5;
    } else if (r2 in M) t += M[r2];
    else throw new Error("YAML: unknown escape sequence");
  }
  return t;
}
function w(e2, t, l4) {
  for (; t < e2.length; ) {
    let n2 = e2[t];
    if (n2 === " " || n2 === `
` || n2 === "	" || n2 === "\r" || l4 && n2 === ",") t++;
    else if (n2 === "#" && (t === 0 || /\s/.test(e2[t - 1]))) {
      let s3 = e2.indexOf(`
`, t);
      t = s3 === -1 ? e2.length : s3;
    } else break;
  }
  return t;
}
function N(e2, t) {
  if (!t) throw new Error("YAML: missed comma between flow collection entries");
  if (e2 === ",") throw new Error("YAML: expected the node content, but found ','");
}
function d(e2, t, l4, n2 = 0) {
  if (n2 > S) throw new Error("YAML: nesting is too deep");
  t = w(e2, t, false);
  let s3 = e2[t];
  if (s3 === "{") {
    let i5 = {};
    t++;
    let u2 = true;
    for (; ; ) {
      if (t = w(e2, t, false), t >= e2.length) throw new g("YAML: unexpected end of the stream within a flow collection");
      if (e2[t] === "}") return [i5, t + 1];
      N(e2[t], u2);
      let a2;
      [a2, t] = d(e2, t, ":,}", n2 + 1), t = w(e2, t, false);
      let o3 = null;
      e2[t] === ":" && ([o3, t] = d(e2, t + 1, ",}", n2 + 1)), Y(i5, String(a2), o3), t = w(e2, t, false), u2 = e2[t] === ",", u2 && t++;
    }
  }
  if (s3 === "[") {
    let i5 = [];
    t++;
    let u2 = true;
    for (; ; ) {
      if (t = w(e2, t, false), t >= e2.length) throw new g("YAML: unexpected end of the stream within a flow collection");
      if (e2[t] === "]") return [i5, t + 1];
      N(e2[t], u2);
      let a2;
      [a2, t] = d(e2, t, ",]", n2 + 1), i5.push(a2), t = w(e2, t, false), u2 = e2[t] === ",", u2 && t++;
    }
  }
  if (s3 === '"') {
    let i5 = t + 1;
    for (; i5 < e2.length && e2[i5] !== '"'; ) i5 += e2[i5] === "\\" ? 2 : 1;
    if (i5 >= e2.length) throw new g("YAML: unexpected end of the stream within a double quoted scalar");
    return [T(e2.slice(t + 1, i5)), i5 + 1];
  }
  if (s3 === "'") {
    let i5 = t + 1;
    for (; i5 < e2.length; ) {
      if (e2[i5] === "'") {
        if (e2[i5 + 1] !== "'") break;
        i5++;
      }
      i5++;
    }
    if (i5 >= e2.length) throw new g("YAML: unexpected end of the stream within a single quoted scalar");
    return [E(e2.slice(t + 1, i5)).replace(/''/g, "'"), i5 + 1];
  }
  let r2 = t;
  for (; r2 < e2.length; ) {
    let i5 = e2[r2];
    if (l4.includes(i5) && (i5 !== ":" || r2 + 1 >= e2.length || /[\s,[\]{}]/.test(e2[r2 + 1]))) break;
    if (i5 === "#" && r2 > t && /\s/.test(e2[r2 - 1])) {
      let u2 = e2.indexOf(`
`, r2);
      return [V(E(e2.slice(t, r2).trim())), u2 === -1 ? e2.length : u2];
    }
    r2++;
  }
  return [V(E(e2.slice(t, r2).trim())), r2];
}
function k(e2) {
  let t = "";
  for (let l4 = 0; l4 < e2.length; l4++) {
    let n2 = e2[l4];
    if (t) n2 === "\\" && t === '"' ? l4++ : n2 === t && (t = "");
    else if (n2 === '"' || n2 === "'") t = n2;
    else if (n2 === "#" && (l4 === 0 || e2[l4 - 1] === " " || e2[l4 - 1] === "	")) return e2.slice(0, l4);
  }
  return e2;
}
function $(e2, t, l4) {
  let n2 = t[0] === ">", s3 = t.includes("-") ? "-" : t.includes("+") ? "+" : "", r2 = /[1-9]/.exec(t), i5 = r2 ? l4 + Number(r2[0]) : -1, u2 = [];
  for (; e2.i < e2.lines.length; ) {
    let c3 = e2.lines[e2.i];
    if (c3.trim() === "") {
      u2.push(""), e2.i++;
      continue;
    }
    let f3 = c3.length - c3.trimStart().length;
    if (i5 === -1) {
      if (f3 <= l4) break;
      i5 = f3;
    }
    if (f3 < i5) break;
    u2.push(c3.slice(i5)), e2.i++;
  }
  let a2 = 0;
  for (; u2.length > 0 && u2[u2.length - 1] === ""; ) u2.pop(), a2++;
  let o3;
  if (n2) {
    o3 = "";
    for (let c3 = 0; c3 < u2.length; c3++) {
      let f3 = u2[c3];
      if (c3 > 0) {
        let h7 = u2[c3 - 1];
        f3 === "" ? o3 += `
` : h7 !== "" && (o3 += /^[ \t]/.test(h7) || /^[ \t]/.test(f3) ? `
` : " ");
      }
      o3 += f3;
    }
  } else o3 = u2.join(`
`);
  return u2.length === 0 ? s3 === "+" ? `
`.repeat(a2) : "" : s3 === "-" ? o3 : s3 === "+" ? o3 + `
`.repeat(a2 + 1) : o3 + `
`;
}
function L(e2, t, l4) {
  let n2 = t[0];
  if ((n2 === "|" || n2 === ">") && /^[|>][-+0-9]*\s*(?:#.*)?$/.test(t)) return $(e2, t, l4);
  if (n2 === "{" || n2 === "[" || n2 === '"' || n2 === "'") {
    let r2 = e2.i, i5 = t, u2 = 0, a2 = 1;
    for (; ; ) try {
      let [o3, c3] = d(i5, 0, ""), f3 = 0;
      for (let m5 = i5.indexOf(`
`); m5 !== -1 && m5 < c3; m5 = i5.indexOf(`
`, m5 + 1)) f3++;
      let h7 = i5.indexOf(`
`, c3);
      if (k(i5.slice(c3, h7 === -1 ? i5.length : h7)).trim() !== "") throw new Error("YAML: unexpected content after a value");
      return e2.i = r2 + f3, o3;
    } catch (o3) {
      if (!(o3 instanceof g)) throw o3;
      if (r2 + u2 >= e2.lines.length) throw new Error(o3.message);
      let c3 = e2.lines.slice(r2 + u2, r2 + u2 + a2);
      i5 += `
` + c3.join(`
`), u2 += c3.length, a2 *= 2;
    }
  }
  let s3 = k(t).trim();
  for (; e2.i < e2.lines.length; ) {
    let r2 = e2.lines[e2.i];
    if (r2.trim() === "") {
      let u2 = e2.i;
      for (; u2 < e2.lines.length && e2.lines[u2].trim() === ""; ) u2++;
      if (u2 >= e2.lines.length || e2.lines[u2].length - e2.lines[u2].trimStart().length <= l4) break;
      s3 += `
`.repeat(u2 - e2.i), e2.i = u2;
      continue;
    }
    if (r2.length - r2.trimStart().length <= l4) break;
    let i5 = k(r2).trim();
    s3 += (s3.endsWith(`
`) ? "" : " ") + i5, e2.i++;
  }
  return V(s3);
}
function x(e2, t, l4 = 0) {
  if (l4 > S) throw new Error("YAML: nesting is too deep");
  if (e2.skipBlank(), e2.i >= e2.lines.length) return null;
  let n2 = e2.indent();
  if (n2 < t) return null;
  let s3 = e2.lines[e2.i].slice(n2);
  if (s3 === "-" || s3.startsWith("- ")) {
    let i5 = [];
    for (; e2.i < e2.lines.length && (e2.skipBlank(), !(e2.i >= e2.lines.length || e2.indent() !== n2)); ) {
      let u2 = e2.lines[e2.i].slice(n2);
      if (u2 !== "-" && !u2.startsWith("- ")) break;
      let a2 = u2.slice(1), o3 = a2.length - a2.trimStart().length + 1, c3 = k(a2).trim();
      c3 === "" ? (e2.i++, i5.push(x(e2, n2 + 1, l4 + 1))) : A(c3) !== null ? (e2.lines[e2.i] = " ".repeat(n2 + o3) + a2.trimStart(), i5.push(x(e2, n2 + o3, l4 + 1))) : (e2.i++, i5.push(L(e2, a2.trim(), n2)));
    }
    return i5;
  }
  if (A(s3) === null) return e2.i++, L(e2, s3.trim(), n2 - 1);
  let r2 = {};
  for (; e2.i < e2.lines.length && (e2.skipBlank(), !(e2.i >= e2.lines.length)); ) {
    let i5 = e2.indent();
    if (i5 < n2) break;
    if (i5 > n2) throw new Error("YAML: bad indentation of a mapping entry");
    let u2 = e2.lines[e2.i].slice(n2), a2 = A(u2);
    if (!a2) throw new Error("YAML: can not read a block mapping entry");
    let o3 = String(d(a2.key, 0, "")[0]), c3 = u2.slice(a2.length);
    if (e2.i++, k(c3).trim() === "") if (e2.skipBlank(), e2.i < e2.lines.length) {
      let f3 = e2.indent(), h7 = e2.lines[e2.i].slice(f3), m5 = h7 === "-" || h7.startsWith("- ");
      Y(r2, o3, f3 > n2 || m5 && f3 === n2 ? x(e2, m5 ? n2 : n2 + 1, l4 + 1) : null);
    } else Y(r2, o3, null);
    else Y(r2, o3, L(e2, c3.trim(), n2));
  }
  return r2;
}
function q(e2) {
  let t = e2.trim();
  if (t[0] === "{" || t[0] === "[") try {
    let [s3, r2] = d(t, 0, "");
    if (w(t, r2, false) === t.length) return s3;
  } catch (s3) {
    throw s3 instanceof g ? new Error(s3.message) : s3;
  }
  let l4 = new y(e2), n2 = x(l4, 0);
  if (l4.skipBlank(), l4.i < l4.lines.length && l4.lines[l4.i].trim() !== "...") throw new Error("YAML: end of the stream or a document separator is expected");
  return n2;
}

// node_modules/pele/dist/esm/chunks/GUJTEFZK.js
function e(n2) {
  return n2 < 128 ? n2 === 32 || n2 >= 9 && n2 <= 13 : n2 === 160 || n2 === 5760 || n2 >= 8192 && n2 <= 8202 || n2 === 8232 || n2 === 8233 || n2 === 8239 || n2 === 8287 || n2 === 12288 || n2 === 65279;
}
function i(n2) {
  return n2 >= 48 && n2 <= 57 || n2 >= 65 && n2 <= 90 || n2 >= 97 && n2 <= 122 || n2 === 95;
}

// node_modules/pele/dist/esm/chunks/MRR2UVJE.js
var x2 = class extends Error {
  constructor(n2, r2 = "syntax", t = {}) {
    super(n2);
    __publicField(this, "code");
    __publicField(this, "type");
    __publicField(this, "mermaidType");
    __publicField(this, "line");
    __publicField(this, "column");
    __publicField(this, "snippet");
    this.name = "PeleError", this.code = r2, this.type = t.type ?? null, this.mermaidType = t.mermaidType ?? null, this.line = t.line ?? 0, this.column = t.column ?? 0, this.snippet = t.snippet ?? "";
  }
};
function C2(e2, n2) {
  let r2 = 1, t = 0;
  for (let a2 = e2.indexOf(`
`); a2 !== -1 && a2 < n2; a2 = e2.indexOf(`
`, a2 + 1)) r2++, t = a2 + 1;
  let i5 = e2.indexOf(`
`, n2);
  i5 === -1 && (i5 = e2.length);
  let o3 = n2 - t + 1, s3 = e2.slice(t, i5);
  return { line: r2, column: o3, snippet: s3 + `
` + "-".repeat(o3 - 1) + "^" };
}
function L2(e2, n2, r2, t, i5 = false) {
  let o3 = C2(n2, r2), s3 = i5 ? `Lexical error on line ${o3.line}. Unrecognized text.` : `Parse error on line ${o3.line}:`, a2 = i5 ? `${s3}
${o3.snippet}` : `${s3}
${o3.snippet}
${t}`;
  return new x2(a2, "syntax", { type: e2, ...o3 });
}
var T2 = "amp:38,lt:60,gt:62,quot:34,apos:39,nbsp:160,iexcl:161,cent:162,pound:163,curren:164,yen:165,sect:167,copy:169,laquo:171,not:172,reg:174,deg:176,plusmn:177,sup2:178,sup3:179,micro:181,para:182,middot:183,sup1:185,raquo:187,frac14:188,frac12:189,frac34:190,iquest:191,times:215,divide:247,ndash:8211,mdash:8212,lsquo:8216,rsquo:8217,sbquo:8218,ldquo:8220,rdquo:8221,bdquo:8222,dagger:8224,Dagger:8225,bull:8226,hellip:8230,permil:8240,prime:8242,Prime:8243,lsaquo:8249,rsaquo:8250,euro:8364,trade:8482,larr:8592,uarr:8593,rarr:8594,darr:8595,harr:8596,lArr:8656,uArr:8657,rArr:8658,dArr:8659,hArr:8660,forall:8704,part:8706,exist:8707,empty:8709,nabla:8711,isin:8712,notin:8713,ni:8715,prod:8719,sum:8721,minus:8722,radic:8730,infin:8734,and:8743,or:8744,cap:8745,cup:8746,int:8747,there4:8756,sim:8764,cong:8773,asymp:8776,ne:8800,equiv:8801,le:8804,ge:8805,sub:8834,sup:8835,sube:8838,supe:8839,oplus:8853,otimes:8855,perp:8869,sdot:8901,loz:9674,spades:9824,clubs:9827,hearts:9829,diams:9830,check:10003,cross:10007,equals:61,colon:58,semi:59,num:35,percnt:37,lpar:40,rpar:41,lbrack:91,rbrack:93,lbrace:123,rbrace:125,vert:124,sol:47,bsol:92,quest:63,excl:33,ast:42,plus:43,comma:44,period:46,dollar:36,commat:64,grave:96,hat:94,lowbar:95,tilde:126,Alpha:913,Beta:914,Gamma:915,Delta:916,Epsilon:917,Zeta:918,Eta:919,Theta:920,Iota:921,Kappa:922,Lambda:923,Mu:924,Nu:925,Xi:926,Omicron:927,Pi:928,Rho:929,Sigma:931,Tau:932,Upsilon:933,Phi:934,Chi:935,Psi:936,Omega:937,alpha:945,beta:946,gamma:947,delta:948,epsilon:949,zeta:950,eta:951,theta:952,iota:953,kappa:954,lambda:955,mu:956,nu:957,xi:958,omicron:959,pi:960,rho:961,sigmaf:962,sigma:963,tau:964,upsilon:965,phi:966,chi:967,psi:968,omega:969";
var d2;
function w2(e2) {
  if (!d2) {
    d2 = /* @__PURE__ */ new Map();
    for (let n2 of T2.split(",")) {
      let r2 = n2.indexOf(":");
      d2.set(n2.slice(0, r2), String.fromCodePoint(Number(n2.slice(r2 + 1))));
    }
  }
  return d2.get(e2);
}
function b2(e2, n2) {
  return e2 > 0 && e2 <= 1114111 && (e2 < 55296 || e2 > 57343) ? String.fromCodePoint(e2) : n2;
}
var E2 = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(\w+));/g;
var q2 = "\uFB02\xB0";
var j = "\xB6\xDF";
function v2(e2) {
  let n2 = "", r2 = 0, t = e2.indexOf(q2);
  for (; t !== -1; ) {
    let i5 = e2.indexOf("\xB6", t + 2);
    if (i5 === -1) break;
    if (e2[i5 + 1] === "\xDF") {
      let o3 = e2[t + 2] === "\xB0", s3 = e2.slice(t + (o3 ? 3 : 2), i5), a2 = e2.slice(t, i5 + 2);
      n2 += e2.slice(r2, t) + (o3 ? b2(Number(s3), a2) : w2(s3) ?? "&" + s3 + ";"), r2 = i5 + 2;
    }
    t = e2.indexOf(q2, i5 + 1);
  }
  return r2 === 0 ? e2 : n2 + e2.slice(r2);
}
function $2(e2) {
  return e2.includes(j) && (e2 = v2(e2)), e2.includes("&") && (e2 = e2.replace(E2, (n2, r2, t, i5) => r2 ? b2(Number(r2), n2) : t ? b2(parseInt(t, 16), n2) : w2(i5) ?? n2)), e2;
}
var l;
var g2 = /* @__PURE__ */ new Map();
function G(e2, n2) {
  let r2 = l, t = g2;
  l = e2, g2 = /* @__PURE__ */ new Map();
  try {
    return n2();
  } finally {
    l = r2, g2 = t;
  }
}
function W(e2) {
  if (l === void 0) return "";
  let n2 = g2.get(e2);
  return n2 === void 0 && (n2 = l(e2) ?? "", g2.set(e2, n2)), n2;
}
var k2 = "7q7q9vfgfgopij5b9999atg87q997q7qfgfgfgfgfgfgfgfgfgfg7q7qg8g8g8fgs7ijijk2k2ijgzlmk27qdwijfgn5k2lmijlmk2ijgzk2ijq8ijijgz7q7q7qd1fg99fgfgdwfgfg7qfgfg6666dw66n5fgfgfgfg99dw7qfgdwk2dwdwdw9a789ag8";
var y2 = "7q99d6fgfgopk26m9999atg87q997q7qfgfgfgfgfgfgfgfgfgfg9999g8g8g8gzr3k2k2k2k2ijgzlmk27qfgk2gzn5k2lmijlmk2ijgzk2ijq8ijijgz997q99g8fg99fggzfggzfg99gzgz7q7qfg7qopgzgzgzgzatfg99gzfglmfgfgdwat7satg8";
function z(e2) {
  let n2 = new Uint16Array(95);
  for (let r2 = 0; r2 < 95; r2++) n2[r2] = parseInt(e2.substr(r2 * 2, 2), 36);
  return n2;
}
var A2;
var O2;
function P(e2) {
  return e2 >= 4352 && e2 <= 4447 || e2 >= 11904 && e2 <= 42191 || e2 >= 44032 && e2 <= 55203 || e2 >= 63744 && e2 <= 64255 || e2 >= 65072 && e2 <= 65103 || e2 >= 65280 && e2 <= 65376 || e2 >= 65504 && e2 <= 65510 || e2 >= 55296 && e2 <= 56319;
}
function F(e2) {
  return e2 >= 768 && e2 <= 879 || e2 >= 8203 && e2 <= 8207 || e2 >= 56320 && e2 <= 57343 || e2 >= 65024 && e2 <= 65039 || e2 === 65279;
}
var D = { width(e2, n2, r2) {
  let t = (r2 & 4) !== 0, i5 = r2 & 1 ? O2 ?? (O2 = z(y2)) : A2 ?? (A2 = z(k2)), o3 = 0;
  for (let s3 = 0; s3 < e2.length; s3++) {
    let a2 = e2.charCodeAt(s3);
    if (!(a2 < 32)) if (a2 < 127) o3 += t ? 600 : i5[a2 - 32];
    else {
      if (F(a2)) continue;
      P(a2) ? o3 += t ? 1200 : 1e3 : o3 += t ? 600 : 580;
    }
  }
  return o3 * n2 / 1e3;
} };
function I() {
  let e2 = globalThis;
  try {
    if (e2.OffscreenCanvas) return new e2.OffscreenCanvas(1, 1).getContext("2d");
    if (e2.document) return e2.document.createElement("canvas").getContext("2d");
  } catch {
    return null;
  }
  return null;
}
var R2 = 2e4;
function M2() {
  let e2 = globalThis;
  return e2.document?.fonts ?? e2.fonts;
}
function S2(e2, n2, r2) {
  try {
    return e2?.check(n2, r2) ?? true;
  } catch {
    return true;
  }
}
function U(e2, n2 = "monospace") {
  let r2 = I();
  if (!r2) return null;
  let t = /* @__PURE__ */ new Map(), i5 = "", o3 = M2()?.size;
  return { width(s3, a2, p4) {
    let m5 = M2();
    m5?.size !== o3 && (o3 = m5?.size, t.clear());
    let f3 = (p4 & 2 ? "italic " : "") + (p4 & 1 ? "bold " : "") + a2 + "px " + (p4 & 4 ? n2 : e2), u2 = t.get(f3);
    u2 || t.set(f3, u2 = /* @__PURE__ */ new Map());
    let c3 = u2.get(s3);
    return c3 === void 0 && (f3 !== i5 && (r2.font = i5 = f3), c3 = r2.measureText(s3).width, S2(m5, f3, s3) && (u2.size >= R2 && u2.clear(), u2.set(s3, c3))), c3;
  } };
}
var h = /* @__PURE__ */ new Map();
function H(e2 = "sans-serif", n2 = "monospace") {
  let r2 = e2 + `
` + n2, t = h.get(r2);
  return t || (t = U(e2, n2) ?? D, h.set(r2, t)), t;
}

// node_modules/pele/dist/esm/chunks/WW4BOJQX.js
var Ye = [["flowchart", "flowchart-elk", /^\s*flowchart-elk/], ["mindmap", "mindmap", /^\s*mindmap/], ["architecture", "architecture", /^\s*architecture/], ["agentflow", "agentflow", /^\s*agentflow-beta\b/], ["c4", "c4", /^\s*C4Context|C4Container|C4Component|C4Dynamic|C4Deployment/], ["kanban", "kanban", /^\s*kanban/], ["class", "classDiagram", /^\s*classDiagram/], ["er", "er", /^\s*erDiagram/], ["gantt", "gantt", /^\s*gantt/], ["info", "info", /^\s*info/], ["pie", "pie", /^\s*pie/], ["requirement", "requirement", /^\s*requirement(Diagram)?/], ["sequence", "sequence", /^\s*sequenceDiagram/], ["swimlane", "swimlane", /^\s*swimlane-beta\b/], ["flowchart", "flowchart-v2", /^\s*(graph|flowchart)/], ["timeline", "timeline", /^\s*timeline/], ["gitGraph", "gitGraph", /^\s*gitGraph/], ["state", "stateDiagram", /^\s*stateDiagram/], ["journey", "journey", /^\s*journey/], ["quadrantChart", "quadrantChart", /^\s*quadrantChart/], ["sankey", "sankey", /^\s*sankey(-beta)?/], ["packet", "packet", /^\s*packet(-beta)?/], ["xychart", "xychart", /^\s*xychart(-beta)?/], ["block", "block", /^\s*block(-beta)?/], ["eventmodeling", "eventmodeling", /^\s*eventmodeling/], ["treeView", "treeView", /^\s*treeView-beta/], ["radar", "radar", /^\s*radar-beta/], ["ishikawa", "ishikawa", /^\s*ishikawa(-beta)?\b/i], ["treemap", "treemap", /^\s*treemap/], ["railroad", "railroad", /^\s*railroad-beta/i], ["railroad", "railroadEbnf", /^\s*railroad-ebnf-beta/i], ["railroad", "railroadAbnf", /^\s*railroad-abnf-beta/i], ["railroad", "railroadPeg", /^\s*railroad-peg-beta/i], ["venn", "venn", /^\s*venn-beta/], ["wardley", "wardley", /^\s*wardley-beta/i], ["cynefin", "cynefin", /^\s*cynefin-beta(?:[\s:]|$)/], ["usecase", "usecase", /^\s*usecase-beta(?:\s|$)/]];
function pe(e2) {
  for (let [t, o3, r2] of Ye) if (r2.test(e2)) return { type: t, mermaidType: o3 };
  return null;
}
var He = /^\s*%%(?!{)[^\n]+\n?/gm;
var U2 = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
var Ve = /<(\w+)([^>]*)>/g;
var Be = /="([^"]*)"/g;
var Ze = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function Ge(e2) {
  return (e2.includes("%%") ? e2.replace(He, "") : e2).trimStart();
}
function ie(e2) {
  return e2 === `
` || e2 === "\r";
}
function ge(e2) {
  return e2 !== void 0 && /\s/.test(e2);
}
function qe(e2) {
  let t = 0;
  for (; t < e2.length && ge(e2[t]) && !ie(e2[t]); ) t++;
  let o3 = e2.slice(0, t);
  if (!e2.startsWith("---", t)) return;
  let r2 = [];
  for (let m5 = t + 3; m5 < e2.length && ge(e2[m5]); m5++) ie(e2[m5]) && r2.push(m5);
  if (r2.length === 0) return;
  let f3 = o3 + "---", a2 = (m5) => {
    if (!ie(e2[m5]) || !e2.startsWith(f3, m5 + 1)) return -1;
    let D4 = -1;
    for (let h7 = m5 + 1 + f3.length; h7 < e2.length && ge(e2[h7]); h7++) ie(e2[h7]) && (D4 = h7);
    return D4;
  }, s3 = `
` + f3, p4 = -1;
  for (let m5 = e2.lastIndexOf(s3); m5 > r2[0]; m5 = e2.lastIndexOf(s3, m5 - 1)) if (a2(m5) !== -1) {
    p4 = m5;
    break;
  }
  if (p4 === -1) return;
  let u2 = r2[0];
  for (let m5 of r2) m5 < p4 && (u2 = m5);
  let l4 = u2 + 1, i5 = l4 > 0 ? l4 - 1 : 0;
  for (let m5 = e2.indexOf(s3, i5); m5 !== -1 && m5 <= p4; m5 = e2.indexOf(s3, m5 + 1)) {
    if (m5 < l4) continue;
    let D4 = a2(m5);
    if (D4 !== -1) return { indent: o3, body: e2.slice(l4, m5), length: D4 + 1 };
  }
}
function Z(e2) {
  return typeof e2 == "object" && e2 !== null && !Array.isArray(e2);
}
function se(e2, t) {
  for (let o3 of Object.keys(t)) {
    if (Ze.has(o3)) continue;
    let r2 = t[o3], f3 = e2[o3];
    Z(r2) && Z(f3) ? se(f3, r2) : Z(r2) ? e2[o3] = se({}, r2) : e2[o3] = r2;
  }
  return e2;
}
function Xe(e2, t) {
  if (!e2.includes("%%{")) return e2;
  let o3 = e2.trim().replace(/'/g, '"');
  U2.lastIndex = 0;
  let r2;
  for (; (r2 = U2.exec(o3)) !== null; ) {
    r2.index === U2.lastIndex && U2.lastIndex++;
    let f3 = r2[1] ?? r2[2];
    if (f3 === "wrap") t.wrap = true;
    else if ((f3 === "init" || f3 === "initialize") && r2[4]) try {
      let a2 = JSON.parse(r2[4].trim());
      Z(a2) && se(t, a2);
    } catch {
    }
  }
  return U2.lastIndex = 0, e2.replace(U2, "");
}
function ye(e2) {
  let t = e2.includes("\r") ? e2.replace(/\r\n?/g, `
`) : e2, o3 = t.includes("<") ? t.lastIndexOf(">") : -1;
  o3 > 0 && (t = t.slice(0, o3 + 1).replace(Ve, (p4, u2, l4) => "<" + u2 + l4.replace(Be, "='$1'") + ">") + t.slice(o3 + 1));
  let r2 = {}, f3, a2 = 0, s3 = t.includes("---") ? qe(t) : void 0;
  if (s3) {
    let p4 = s3.indent ? s3.body.split(`
`).map((l4) => l4.startsWith(s3.indent) ? l4.slice(s3.indent.length) : l4).join(`
`) : s3.body, u2;
    try {
      u2 = q(p4);
    } catch (l4) {
      throw new x2(`Front matter is not valid YAML. ${l4.message}`, "syntax");
    }
    if (Z(u2) && (u2.title && (f3 = String(u2.title)), Z(u2.config) && se(r2, u2.config), u2.displayMode)) {
      let l4 = Z(r2.gantt) ? r2.gantt : r2.gantt = {};
      l4.displayMode = String(u2.displayMode);
    }
    for (let l4 = t.indexOf(`
`); l4 !== -1 && l4 < s3.length; l4 = t.indexOf(`
`, l4 + 1)) a2++;
    t = t.slice(s3.length);
  }
  return t = Xe(t, r2), { text: Ge(t), title: f3, config: r2, withComments: t, lineOffset: a2 };
}
var Ke = /#\w+;/g;
var Ue = /^\+?\d+$/;
var he = new RegExp("[\\n\\r\u2028\u2029]", "g");
function Oe(e2, t) {
  let o3 = e2.indexOf(t);
  if (o3 === -1) return e2;
  let r2 = "", f3 = 0;
  for (; o3 !== -1; ) {
    he.lastIndex = o3;
    let a2 = he.test(e2) ? he.lastIndex - 1 : e2.length, s3 = false, p4 = -1;
    for (let u2 = o3 + t.length; u2 < a2; u2++) {
      let l4 = e2.charCodeAt(u2);
      if (l4 === 58) s3 = true;
      else if (l4 === 35) {
        if (s3) {
          p4 = u2;
          break;
        }
      } else e(l4) && (s3 = false);
    }
    if (p4 !== -1) {
      let u2 = e2.lastIndexOf(";", a2 - 1);
      u2 > p4 && (r2 += e2.slice(f3, u2), f3 = u2 + 1);
    }
    o3 = a2 >= e2.length ? -1 : e2.indexOf(t, a2 + 1);
  }
  return f3 === 0 ? e2 : r2 + e2.slice(f3);
}
function Le(e2) {
  return e2.includes("#") ? Oe(Oe(e2, "style"), "classDef").replace(Ke, (t) => {
    let o3 = t.substring(1, t.length - 1);
    return (Ue.test(o3) ? "\uFB02\xB0\xB0" : "\uFB02\xB0") + o3 + "\xB6\xDF";
  }) : e2;
}
var lt = Math.random().toString(36).slice(2, 7);
var de = /* @__PURE__ */ new Map();
function _t(...e2) {
  for (let t of e2) de.set(t.type, t);
}
var mt = 5e4;
var pt = 4e6;
var gt = 5e3;
function Se(e2) {
  try {
    return e2();
  } catch (t) {
    throw t instanceof RangeError ? new x2("Diagram is nested too deeply.", "limit") : t;
  }
}
function Ae(e2, t) {
  try {
    return t();
  } catch (o3) {
    throw o3 instanceof RangeError ? new x2("Diagram is nested too deeply.", "limit", e2) : (o3 instanceof x2 && (o3.type ?? (o3.type = e2.type), o3.mermaidType ?? (o3.mermaidType = e2.mermaidType)), o3);
  }
}
var Pe = /* @__PURE__ */ new WeakMap();
function Fe(e2, t = mt, o3 = gt, r2) {
  if (e2.length > t) throw new x2(`Diagram source is longer than the limit of ${t} characters.`, "limit");
  let f3 = ye(e2), a2 = pe(f3.text);
  if (a2 === null) throw new x2("No diagram type detected for the given text.", "unsupported-diagram");
  let s3 = de.get(a2.type);
  if (s3 === void 0) throw new x2(`Diagram type "${a2.type}" is not supported yet.`, "unsupported-diagram", a2);
  let p4 = r2 ? { ...r2, ...f3.config } : f3.config, u2 = s3.keepComments ? f3.withComments : f3.text, l4 = Ae(a2, () => s3.parse(Le(u2) + `
`, p4, f3.title, f3.lineOffset, { maxEdges: o3 }));
  return { ...a2, diagram: s3, model: l4, config: p4 };
}
function ht(e2, t) {
  if (typeof e2 == "string") return Fe(e2, t.limit, t.maxEdges, t.config);
  let o3 = Pe.get(e2);
  if (o3 === void 0) throw new TypeError("render() takes diagram text or a model that parse() returned.");
  return o3;
}
function wt(e2, t = {}) {
  return Se(() => {
    let { type: o3, mermaidType: r2, diagram: f3, model: a2, config: s3 } = ht(e2, t), p4 = s3[f3.section ?? o3], u2 = typeof p4 == "object" && p4 !== null && !Array.isArray(p4) && p4.useMaxWidth === false, l4 = t.responsive ?? !u2, i5 = t.icons, m5 = i5 && ((E6) => i5($2(E6))), D4 = Ae({ type: o3, mermaidType: r2 }, () => G(m5, () => f3.render(a2, s3, { ...t, responsive: l4, icons: m5 }))), h7 = t.outputLimit ?? pt;
    if (D4.svg.length > h7) throw new x2(`Diagram output is longer than the limit of ${h7} characters.`, "limit", { type: o3, mermaidType: r2 });
    for (let E6 of D4.links) E6.id = $2(E6.id);
    return { type: o3, mermaidType: r2, ...D4 };
  });
}

// node_modules/pele/dist/esm/chunks/FTXIJQGB.js
var c = [["rect", "proc", "process", "rectangle", "squareRect"], ["rounded", "event", "roundedRect"], ["stadium", "terminal", "pill"], ["fr-rect", "subprocess", "subproc", "framed-rectangle", "subroutine"], ["cyl", "db", "database", "cylinder"], ["datastore", "data-store"], ["folder", "directory"], ["bucket"], ["console"], ["browser"], ["person"], ["circle", "circ"], ["bang"], ["cloud"], ["diam", "decision", "diamond", "question"], ["hex", "hexagon", "prepare"], ["lean-r", "lean-right", "in-out", "lean_right"], ["lean-l", "lean-left", "out-in", "lean_left"], ["trap-b", "priority", "trapezoid-bottom", "trapezoid"], ["trap-t", "manual", "trapezoid-top", "inv-trapezoid", "inv_trapezoid"], ["dbl-circ", "double-circle", "doublecircle"], ["text"], ["notch-rect", "card", "notched-rectangle"], ["lin-rect", "lined-rectangle", "lined-process", "lin-proc", "shaded-process"], ["sm-circ", "start", "small-circle", "stateStart"], ["fr-circ", "stop", "framed-circle", "stateEnd"], ["fork", "join", "forkJoin"], ["hourglass", "collate"], ["brace", "comment", "brace-l"], ["brace-r"], ["braces"], ["bolt", "com-link", "lightning-bolt"], ["doc", "document"], ["delay", "half-rounded-rectangle"], ["h-cyl", "das", "horizontal-cylinder"], ["lin-cyl", "disk", "lined-cylinder"], ["curv-trap", "curved-trapezoid", "display"], ["div-rect", "div-proc", "divided-rectangle", "divided-process"], ["tri", "extract", "triangle"], ["win-pane", "internal-storage", "window-pane"], ["f-circ", "junction", "filled-circle"], ["notch-pent", "loop-limit", "notched-pentagon"], ["flip-tri", "manual-file", "flipped-triangle"], ["sl-rect", "manual-input", "sloped-rectangle"], ["docs", "documents", "st-doc", "stacked-document"], ["st-rect", "procs", "processes", "stacked-rectangle"], ["bow-rect", "stored-data", "bow-tie-rectangle"], ["cross-circ", "summary", "crossed-circle"], ["tag-doc", "tagged-document"], ["tag-rect", "tagged-rectangle", "tag-proc", "tagged-process"], ["flag", "paper-tape"], ["odd", "rect_left_inv_arrow"], ["lin-doc", "lined-document"]];
var o = ["state", "choice", "note", "composite", "rectWithTitle", "labelRect", "block_arrow", "collapsedGroup", "iconSquare", "iconCircle", "icon", "iconRounded", "imageSquare", "anchor", "kanbanItem", "mindmapCircle", "defaultMindmapNode", "classBox", "erBox", "requirementBox", "usecaseActor", "usecaseActorHollow", "usecaseActorAwesome", "usecaseActorIcon", "usecaseBusiness", "usecaseEllipse", "usecaseJsonTable"];
var n = /* @__PURE__ */ new Map([["square", "rect"], ["round", "rounded"], ["ellipse", "ellipse"], ["hexagon", "hex"], ["diamond", "diam"]]);
var r = /* @__PURE__ */ new Map();
for (let e2 of c) for (let t of e2) r.set(t, e2[0]);
for (let e2 of o) r.set(e2, e2);
function a(e2) {
  return r.has(e2);
}
function i2(e2) {
  return e2 === void 0 ? "rect" : n.get(e2) ?? r.get(e2) ?? "rect";
}

// node_modules/pele/dist/esm/chunks/7WLXJQOR.js
var l2 = "4q 0 b 0 5 0 6 m 2 u 2 cp 5 b f 4 8 0 2 0 3m 4 2 1 3 3 9 0 2 2 2 0 2 j 2 2a 2 3u 9 4d a 11 3 0 8 12 21 q 6 2 1a 16 10 1 2 2q 2 0 g 1 8 1 b 2 3 0 h 0 2 t u 2g c 0 p w a 1 5 0 6 l 5 0 a 0 4 0 o o 20 0 2 a 2g 1h 4 0 j 0 8 9 g 6 2 6 6 7 3 1 3 l 2 6 2 0 4 3 4 0 h 0 e 1 2 2 f 1 k 5 5 1 3 l 2 6 2 1 2 1 2 1 w 3 2 0 k 2 h 8 2 2 2 l 2 6 2 1 2 4 4 0 j 0 g 1 10 7 3 1 3 l 2 6 2 1 2 4 4 0 v 1 2 2 g 0 i 0 2 5 4 2 2 3 4 1 2 0 2 1 4 1 4 2 4 b n 0 1h 7 2 2 2 m 2 9 2 4 4 0 r 1 7 1 10 7 2 2 2 m 2 9 2 4 4 0 x 0 2 1 g 1 j 7 2 2 2 14 3 0 h 0 i 1 p 5 6 h 4 n 2 8 2 0 3 6 1n 1b 2 1 d 6 1n 1 2 0 3 1 2 0 3 0 7 3 2 6 2 2 2 0 2 0 3 1 2 3 2 1 a 0 3 4 2 0 m 3 x 0 1s 7 2 z s 4 38 16 l 0 h 5 5 3 4 0 4 1 8 2 5 c d 0 i 11 2 0 6 0 3 16 2 98 2 3 3 6 2 0 2 3 3 14 2 3 3 w 2 3 3 6 2 0 2 3 3 e 2 1k 2 3 3 1u 12 f h 2c d h7 3 g 2 p 6 22 m c 2 3 f h f h f c 2 2 g 1f 10 0 5 0 1w 2f 9 14 2 0 6 1x b s 1g t 3 4 c 17 m 6 1l m a 1g 2b 0 2m 1a i 6 1k t e 1 b 17 r z 16 2 b z 30 3 2 3 4 1 a 5b 1t 7p 3 5 3 11 3 5 3 7 2 0 2 0 2 0 2 u 3 1g 2 6 2 0 4 2 2 6 4 3 3 5 5 c 6 2 2 6 39 0 e 0 h c 2u 0 5 0 3 9 2 0 4 4 7 0 2 0 2 0 2 3 2 a 3 3 6 4 5 0 1h 1 22k 1a 2 1a 2 3o 7 3 4 1 d 11 2 0 6 0 3 1j 8 0 h m a 6 2 6 2 6 2 6 2 6 2 6 2 6 2 6 29 0 d2 1 17 4 6 1 5 2d 7 2 2 2h 2 3 6 14 4 2l i q 1i f e9 52t 23 g5o 1g wc 1w 19 3 7g 4 f b 1 l 1a h o 9 1x 1e 8 3 2u 3 3 2 3 d a 26 9 2 2 2 3 2 m u 1f f 1d 1r 5 4 0 f r b m q s 8 1a t 0 1d 14 o 2 2 7 l m 4 0 6 1b 2 0 4 1 3 4 3 0 2 0 p 2 3 a 8 2 d 5 3 5 3 5 a 6 2 6 42 y u 8mb d m 5 1c 6it a5 3 2x 13 6 d 4 6 0 2 9 2 c 2 4 2 0 2 1 2 1 2 2z y a2 j 1r 3 1h 15 b 39 4 2 3q 11 p 7 p c 2g 4 5 3 5 3 5 3 2";
var f;
function i3() {
  let e2 = l2.split(" "), a2 = new Uint16Array(e2.length), n2 = 0;
  for (let t = 0; t < e2.length; t += 2) {
    let r2 = n2 + parseInt(e2[t], 36);
    n2 = r2 + parseInt(e2[t + 1], 36), a2[t] = r2, a2[t + 1] = n2;
  }
  return a2;
}
function h2(e2) {
  if (e2 < 170 || e2 > 65500) return false;
  let a2 = f ?? (f = i3()), n2 = 0, t = (a2.length >> 1) - 1;
  for (; n2 <= t; ) {
    let r2 = n2 + t >> 1;
    if (e2 < a2[r2 * 2]) t = r2 - 1;
    else if (e2 > a2[r2 * 2 + 1]) n2 = r2 + 1;
    else return true;
  }
  return false;
}

// node_modules/pele/dist/esm/chunks/IUDOOOVD.js
var U3 = /[&<>"\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
var K2 = /[&<>"]|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+/g;
var Y2 = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function $3(t) {
  return U3.test(t) ? t.replace(K2, (e2) => Y2[e2] ?? "") : t;
}
function y3(t) {
  return $3($2(t));
}
var v3 = [];
for (let t = 0; t < 100; t++) v3.push(t === 0 ? "" : t % 10 === 0 ? "." + t / 10 : "." + (t < 10 ? "0" + t : t));
function m(t) {
  let e2 = Math.round(t * 100);
  if (e2 === 0) return "0";
  if (e2 > 0) {
    if (e2 < 1e11) {
      let i5 = Math.floor(e2 / 100);
      return i5 + v3[e2 - i5 * 100];
    }
  } else if (e2 > -1e11) {
    let i5 = -e2, n2 = Math.floor(i5 / 100);
    return "-" + n2 + v3[i5 - n2 * 100];
  }
  return String(e2 / 100);
}
function gt2(t, e2, i5, n2, s3) {
  let d4 = t.lines;
  if (d4.length === 0) return "";
  let f3 = t.lineHeight, c3 = t.size * 0.35, u2 = i5 - t.height / 2 + f3 / 2 + c3;
  if (d4.length === 1 && d4[0].length === 1 && d4[0][0].icon === void 0 && d4[0][0].style === 0) return `<text${n2} x="${m(e2)}" y="${m(u2)}" text-anchor="middle">${$3(d4[0][0].text)}</text>`;
  let o3 = q3(t);
  n2 = G2(n2, o3);
  let a2 = "", l4 = "";
  for (let r2 = 0; r2 < d4.length; r2++) {
    let p4 = d4[r2], x5 = false;
    for (let g5 of p4) g5.icon !== void 0 && (x5 = true);
    if (x5) {
      let g5 = e2 - t.widths[r2] / 2;
      for (let h7 of p4) {
        if (h7.icon !== void 0) {
          let w5 = t.size * 1.1, S5 = s3?.(h7.icon) ?? "";
          l4 += `<svg class="pele-icon" data-icon="${y3(h7.icon)}" x="${m(g5)}" y="${m(u2 - c3 - w5 / 2)}" width="${m(w5)}" height="${m(w5)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${S5}</svg>`;
        } else h7.text !== "" && (a2 += `<tspan x="${m(g5)}" y="${m(u2)}" text-anchor="start"${T3(h7.style & ~o3)}>${$3(h7.text)}</tspan>`);
        g5 += h7.width;
      }
    } else {
      for (let g5 = 0; g5 < p4.length; g5++) {
        let h7 = p4[g5], w5 = g5 === 0 ? ` x="${m(e2)}" y="${m(u2)}"` : "";
        a2 += `<tspan${w5}${T3(h7.style & ~o3)}>${$3(h7.text)}</tspan>`;
      }
      p4.length === 0 && (a2 += `<tspan x="${m(e2)}" y="${m(u2)}"> </tspan>`);
    }
    u2 += f3;
  }
  return `<text${n2} text-anchor="middle" xml:space="preserve">${a2}</text>${l4}`;
}
var C3 = ' font-weight="var(--_w)"';
var L3 = ' font-style="italic"';
function T3(t) {
  return (t & 1 ? C3 : "") + (t & 2 ? L3 : "");
}
function q3(t) {
  let e2 = 3, i5 = false;
  for (let n2 of t.lines) for (let s3 of n2) s3.icon !== void 0 || s3.text === "" || (e2 &= s3.style, i5 = true);
  return i5 ? e2 : 0;
}
function G2(t, e2) {
  return t + (e2 & 1 && !t.includes(' font-weight="') ? C3 : "") + (e2 & 2 && !t.includes(' font-style="') ? L3 : "");
}
var N2 = "--_bg:var(--pele-bg,#fff);--_fg:var(--pele-fg,#1f1f1f);--_m:var(--pele-muted,#6e6e6e);--_l:var(--pele-line,#1f1f1f);--_s:var(--pele-surface,#f3f3f3);--_a:var(--pele-surface-alt,#e6e6e6);--_b:var(--pele-border,#8a8a8a);--_c:var(--pele-accent,#5b7bd5);color:var(--_fg)";
var E3 = "var(--pele-radius,4px)";
var k3 = String.raw`(?:"[^"'\\\n<>{}();:@]*"|'[^"'\\\n<>{}();:@]*'|[\p{L}\p{N}_-][\p{L}\p{N}_ .-]*)`;
var J = new RegExp(String.raw`^\s*${k3}(?:\s*,\s*${k3})*\s*$`, "u");
function M3(t, e2) {
  return t && J.test(t) ? t : e2;
}
function D2(t, e2, i5) {
  return `;--_fm:var(--pele-font-mono,${M3(i5, "monospace")});font:${t}px sans-serif;letter-spacing:normal;word-spacing:normal;text-transform:none;direction:ltr;font-family:var(--pele-font,${M3(e2, "sans-serif")})`;
}
var z2 = /* @__PURE__ */ new Set(["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "rx", "ry"]);
var X = /* @__PURE__ */ new Set(["color", "font-size", "font-family", "font-weight", "font-style", "text-decoration", "letter-spacing", "word-spacing", "opacity"]);
var Z2 = /url\s*\(|expression\s*\(|javascript:|[<>{};\\]|@import|image-set|\/\*/i;
var A3 = { shape: "", line: "", text: "", stroke: void 0, bold: false, italic: false, fontSize: void 0 };
function wt2(t) {
  if (t.length === 0) return A3;
  let e2 = /* @__PURE__ */ new Map(), i5 = /* @__PURE__ */ new Map();
  for (let o3 of t) {
    let a2 = o3.indexOf(":");
    if (a2 <= 0) continue;
    let l4 = o3.slice(0, a2).trim().toLowerCase(), r2 = o3.slice(a2 + 1).replace(/!important/gi, "").trim();
    r2 === "" || Z2.test(r2) || (z2.has(l4) && e2.set(l4, r2), X.has(l4) && i5.set(l4 === "color" ? "fill" : l4, r2));
  }
  if (e2.size === 0 && i5.size === 0) return A3;
  let n2 = "", s3 = "";
  for (let [o3, a2] of e2) n2 += `${o3}:${a2};`, o3 !== "fill" && o3 !== "fill-opacity" && (s3 += `${o3}:${a2};`);
  let d4 = "";
  for (let [o3, a2] of i5) d4 += `${o3}:${a2};`;
  let f3 = i5.get("font-weight"), c3 = i5.get("font-size"), u2 = c3 && /^[\d.]+(px)?$/.test(c3) ? parseFloat(c3) : void 0;
  return { shape: n2 ? ` style="${$3(n2)}"` : "", line: s3 ? ` style="${$3(s3)}"` : "", text: d4 ? ` style="${$3(d4)}"` : "", stroke: e2.get("stroke"), bold: f3 === "bold" || f3 === "bolder" || Number(f3) >= 600, italic: i5.get("font-style") === "italic", fontSize: u2 !== void 0 && u2 > 0 && u2 <= 200 ? u2 : void 0 };
}
var Q = /[^\w-]+/g;
function bt2(t) {
  let e2 = t.replace(Q, " ").trim();
  return e2 === "" ? "" : " " + e2;
}
var _2 = ` rx="${E3}"`;
var W2 = /<rect\b[^>]*>/g;
function tt(t) {
  return t.includes(_2) ? t.replace(W2, (e2) => {
    let i5 = e2.indexOf(_2);
    if (i5 < 0) return e2;
    let n2 = e2.slice(0, i5) + e2.slice(i5 + _2.length), s3 = n2.indexOf(' style="');
    if (s3 >= 0) return `${n2.slice(0, s3 + 8)}rx:var(--_r);${n2.slice(s3 + 8)}`;
    let d4 = n2.endsWith("/>") ? n2.length - 2 : n2.length - 1;
    return `${n2.slice(0, d4)} style="rx:var(--_r)"${n2.slice(d4)}`;
  }) : t;
}
var et = [["--_tw", "title"], ["--_hw", "heading"], ["--_w", "bold"]];
function _t2(t, e2, i5, n2, s3, d4, f3) {
  let c3 = $3(s3.idPrefix ?? "pele"), u2 = "", o3 = "";
  d4.accTitle && (u2 += `<title id="${c3}-title">${y3(d4.accTitle)}</title>`, o3 += ` aria-labelledby="${c3}-title"`), d4.accDescr && (u2 += `<desc id="${c3}-desc">${y3(d4.accDescr)}</desc>`, o3 += ` aria-describedby="${c3}-desc"`);
  let a2 = s3.responsive === false ? "" : "max-width:100%;height:auto;";
  f3 = tt(f3);
  let l4 = f3.includes("var(--_r)") ? `;--_r:${E3}` : "";
  for (let [r2, p4] of et) f3.includes(`var(${r2})`) && (l4 += `;${r2}:var(--pele-${p4}-weight,bold)`);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pele pele-${t}" viewBox="0 0 ${e2} ${i5}" width="${e2}" height="${i5}" style="${a2}${N2}${l4}${$3(D2(n2, s3.fontFamily, s3.fontFamilyMono))}" fill="var(--_fg)" role="graphics-document document" aria-roledescription="${t}"${o3}>` + u2 + f3 + "</svg>";
}
var nt = 1.5;
var it = /<br\s*\/?>|\\n|\n/gi;
var P2 = /<\/?([a-zA-Z][\w-]*)(?:\s[^<>]*)?\/?>/y;
var B2 = /(fa[bklrs]?):fa-([\w-]+)/g;
var st = /[<\\\n*_]|fa[bklrs]?:fa-/;
var I2 = "\\u2e80-\\u9fff\\uf900-\\ufaff\\uff00-\\uff60";
var j2 = "\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF09\uFF3D\uFF5D\u300D\u300F\u3011\u3015\u3009\u300B\u3019\u3017\u30FC\u2026\u2025\u30FB\u309D\u309E\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE,.:;!?)\\]}";
var ot = "\uFF08\uFF3B\uFF5B\u300C\u300E\u3010\u3014\u3008\u300A\u3018\u3016([{";
var rt2 = new RegExp(`[${I2}]`);
var lt2 = new RegExp(`\\s*(?:[${ot}]*[${I2}][${j2}]*|[^\\s${I2}]+[${j2}]*)\\s*|\\s+`, "g");
var ct = { lines: [], widths: [], width: 0, height: 0, size: 0, lineHeight: 0 };
function ft(t) {
  let e2 = t.split(`
`), i5 = 1 / 0;
  for (let n2 of e2) {
    if (n2.trim() === "") continue;
    let s3 = n2.length - n2.trimStart().length;
    s3 < i5 && (i5 = s3);
  }
  return i5 === 1 / 0 || i5 === 0 ? t : e2.map((n2) => n2.slice(Math.min(i5, n2.length - n2.trimStart().length))).join(`
`);
}
function R3(t, e2, i5) {
  if (e2 === "") return;
  let n2 = $2(e2), s3 = t[t.length - 1];
  s3 && s3.style === i5 && s3.icon === void 0 ? s3.text += n2 : t.push({ text: n2, style: i5, width: 0 });
}
function at(t, e2, i5) {
  if (!e2.includes(":fa-")) {
    R3(t, e2, i5);
    return;
  }
  let n2 = 0;
  B2.lastIndex = 0;
  let s3;
  for (; (s3 = B2.exec(e2)) !== null; ) {
    let d4 = `${s3[1]}:fa-${s3[2]}`;
    if (R3(t, e2.slice(n2, s3.index), i5), n2 = s3.index + s3[0].length, W(d4) !== "") t.push({ text: "", style: i5, icon: d4, width: 0 });
    else if (e2[n2] === " ") n2++;
    else if (n2 === e2.length) {
      let f3 = t[t.length - 1];
      f3 && f3.icon === void 0 && (f3.text = f3.text.trimEnd());
    }
  }
  R3(t, e2.slice(n2), i5);
}
function dt(t, e2, i5, n2) {
  let s3 = n2, d4 = 0, f3 = "", c3 = 0, u2 = e2.length, o3 = () => {
    at(t, f3, s3), f3 = "";
  };
  for (; c3 < u2; ) {
    let a2 = e2[c3];
    if (a2 === "<") {
      P2.lastIndex = c3;
      let l4 = P2.exec(e2);
      if (l4 && l4.index === c3) {
        let r2 = l4[1].toLowerCase(), p4 = e2[c3 + 1] === "/", x5 = r2 === "b" || r2 === "strong" ? 1 : r2 === "i" || r2 === "em" ? 2 : 0;
        x5 && (o3(), s3 = p4 ? s3 & ~x5 | n2 & x5 : s3 | x5), c3 += l4[0].length;
        continue;
      }
    } else if (i5 && (a2 === "*" || a2 === "_")) {
      let l4 = e2[c3 + 1] === a2, r2 = l4 ? 1 : 2, p4 = l4 ? 2 : 1, x5 = (d4 & r2) === 0, g5 = c3 > 0 ? e2[c3 - 1] : " ", h7 = c3 + p4 < u2 ? e2[c3 + p4] : " ", w5 = x5 && h7.trim() !== "" && e2.indexOf(l4 ? a2 + a2 : a2, c3 + p4) !== -1, S5 = !x5 && g5.trim() !== "", H4 = a2 === "_" && /\w/.test(g5) && /\w/.test(h7);
      if ((w5 || S5) && !H4) {
        o3(), d4 = w5 ? d4 | r2 : d4 & ~r2, s3 = w5 ? s3 | r2 : s3 & ~r2 | n2 & r2, c3 += p4;
        continue;
      }
    }
    f3 += a2, c3++;
  }
  o3();
}
function ut(t, e2, i5) {
  let n2 = 0;
  for (let s3 of t) s3.width = s3.icon !== void 0 ? i5 * 1.25 : e2.width(s3.text, i5, s3.style), n2 += s3.width;
  return n2;
}
function F2(t, e2, i5, n2, s3, d4) {
  let f3 = [], c3 = 0, u2 = () => {
    let o3 = f3[f3.length - 1];
    if (o3 && o3.icon === void 0) {
      let a2 = o3.text.trimEnd();
      if (a2 !== o3.text) {
        o3.text = a2;
        let l4 = e2.width(a2, i5, o3.style);
        c3 += l4 - o3.width, o3.width = l4;
      }
    }
    s3.push(f3), d4.push(c3), f3 = [], c3 = 0;
  };
  for (let o3 of t) {
    if (o3.icon !== void 0) {
      let a2 = i5 * 1.25;
      c3 > 0 && c3 + a2 > n2 && u2(), f3.push({ ...o3, width: a2 }), c3 += a2;
      continue;
    }
    for (let a2 of o3.text.match(lt2) ?? []) {
      let l4 = a2;
      c3 > 0 && c3 + e2.width(l4.trimEnd(), i5, o3.style) > n2 && (u2(), l4 = l4.trimStart());
      let r2 = f3[f3.length - 1];
      if (r2 && r2.style === o3.style && r2.icon === void 0) {
        r2.text += l4, r2.width = e2.width(r2.text, i5, r2.style), c3 = 0;
        for (let p4 of f3) c3 += p4.width;
      } else {
        let p4 = e2.width(l4, i5, o3.style);
        f3.push({ text: l4, style: o3.style, width: p4 }), c3 += p4;
      }
    }
  }
  (f3.length > 0 || s3.length === 0) && u2();
}
function Tt(t, e2, i5, n2, s3, d4 = 0) {
  if (t === void 0 || t === "") return ct;
  let f3 = Math.round(n2 * nt);
  if (!st.test(t) && !t.includes("&") && !t.includes("\uFB02")) {
    let l4 = t.trim(), r2 = i5.width(l4, n2, d4);
    if (r2 <= s3 || !(l4.includes(" ") || rt2.test(l4))) return { lines: [[{ text: l4, style: d4, width: r2 }]], widths: [r2], width: r2, height: f3, size: n2, lineHeight: f3 };
    let p4 = [], x5 = [];
    F2([{ text: l4, style: d4, width: r2 }], i5, n2, s3, p4, x5);
    let g5 = 0;
    for (let h7 of x5) h7 > g5 && (g5 = h7);
    return { lines: p4, widths: x5, width: g5, height: p4.length * f3, size: n2, lineHeight: f3 };
  }
  let c3 = e2 ? ft(t.replace(/\r\n?/g, `
`)).trim() : t.trim(), u2 = [], o3 = [], a2 = 0;
  for (let l4 of c3.split(it)) {
    let r2 = [];
    dt(r2, l4.trim(), e2, d4);
    let p4 = ut(r2, i5, n2);
    p4 > s3 ? F2(r2, i5, n2, s3, u2, o3) : (u2.push(r2), o3.push(p4));
  }
  for (let l4 of o3) l4 > a2 && (a2 = l4);
  return { lines: u2, widths: o3, width: a2, height: u2.length * f3, size: n2, lineHeight: f3 };
}

// node_modules/pele/dist/esm/chunks/CAVQFYGD.js
function x3(e2, t) {
  for (let n2 = 0; n2 < t.length; n2 += 3) {
    let o3 = Math.round(t[n2 + 1]), s3 = e2.get(o3);
    s3 ? s3.push(t[n2]) : e2.set(o3, [t[n2]]);
  }
}
function h3(e2, t, n2, o3) {
  if (t === 0) return e2.x;
  let s3 = e2.y - e2.h / 2, r2 = e2.x - e2.w / 2, i5 = t / 2, l4 = [r2 + o3 - 6 + i5, e2.x, r2 + e2.w - o3 + 6 - i5], u2 = n2.get(Math.round(s3));
  if (u2 === void 0) return l4[0];
  let m5 = l4[0], f3 = -1;
  for (let p4 of l4) {
    let a2 = 1 / 0;
    for (let b4 of u2) b4 > r2 && b4 < r2 + e2.w && (a2 = Math.min(a2, Math.abs(b4 - p4) - i5));
    if (a2 >= 6) return p4;
    a2 > f3 + 0.5 && (f3 = a2, m5 = p4);
  }
  return m5;
}
function y4(e2, t, n2, o3) {
  let s3 = t > 0 ? o3.get(Math.round(e2.y - e2.h / 2)) : void 0;
  if (s3 === void 0) return false;
  let r2 = e2.x - e2.w / 2;
  for (let i5 of s3) if (i5 > r2 && i5 < r2 + e2.w && Math.abs(i5 - n2) < t / 2 + 4) return true;
  return false;
}
function C4(e2, t, n2, o3, s3, r2, i5, l4) {
  let u2 = 1;
  for (let f3 = r2[i5].parent; f3 >= 0 && u2 < 8; f3 = r2[f3].parent) u2++;
  let m5 = `color-mix(in srgb,var(--_a) ${m(100 * (1 - 0.5 ** u2))}%,var(--_bg))`;
  return `<g class="pele-cluster-title" data-id="${s3}">` + gt2(e2, t, n2, ` fill="none" stroke="${m5}" stroke-width="5" stroke-linejoin="round"`, l4) + gt2(e2, t, n2, o3, l4) + "</g>";
}

// node_modules/pele/dist/esm/chunks/KHO3NZBQ.js
function gn(l4, A6, e2 = 0) {
  return { w: l4, h: A6, kind: e2, pin: 0, span: 0, x: 0, y: 0, rank: 0 };
}
function En(l4, A6, e2 = 1, g5 = 0, b4 = 0) {
  return { tail: l4, head: A6, minlen: e2, labelW: g5, labelH: b4, tailDx: 0, headDx: 0, tailFixed: false, headFixed: false, reversed: false, points: [], labelX: 0, labelY: 0 };
}
var Bt = 24;
var _t3 = 2e4;
var Kt = 16;
var Tt2 = 8;
var Vt = 0.125;
var Ot = 3;
var qt = 18;
var zt = 10;
var Qt = 14;
var Zt = 2;
var Jt = 28;
var Wt = 12;
var tn = 12;
var nn = 8;
var en = 4;
var Ht = 0.5;
var wt3 = 0.5;
var Gt = 12;
var rn = 40;
var jt2 = 400;
function Mt(l4) {
  return l4 === 1 || l4 === 2;
}
function Ct(l4, A6, e2, g5) {
  for (let b4 = A6 + 1; b4 < e2; b4++) {
    let F3 = l4[b4], E6 = g5[F3], R5 = b4 - 1;
    for (; R5 >= A6 && (g5[l4[R5]] > E6 || g5[l4[R5]] === E6 && l4[R5] > F3); ) l4[R5 + 1] = l4[R5], R5--;
    l4[R5 + 1] = F3;
  }
}
function In(l4, A6, e2) {
  let g5 = l4.length;
  if (g5 === 0) return { width: 0, height: 0 };
  let b4 = A6.length, F3 = 1;
  if (b4 > 0) {
    let n2 = /* @__PURE__ */ new Set();
    for (let f3 of A6) {
      let M6 = Math.min(f3.tail, f3.head), B4 = Math.max(f3.tail, f3.head), Y3 = M6 * g5 + B4;
      if (f3.labelW > 0 || n2.has(Y3)) {
        F3 = 2;
        break;
      }
      n2.add(Y3);
    }
  }
  on(l4, A6), sn(l4, A6, F3);
  let E6 = new Int32Array(b4), R5 = 0;
  for (let n2 = 0; n2 < b4; n2++) {
    let f3 = A6[n2];
    E6[n2] = Math.abs(l4[f3.head].rank - l4[f3.tail].rank), E6[n2] > 1 && (R5 += E6[n2] - 1);
  }
  let y6 = new Uint8Array(b4);
  if (R5 > _t3) {
    let n2 = [];
    for (let f3 = 0; f3 < b4; f3++) E6[f3] > 1 && n2.push(f3);
    n2.sort((f3, M6) => E6[M6] - E6[f3] || f3 - M6);
    for (let f3 of n2) {
      if (R5 <= _t3) break;
      y6[f3] = 1, R5 -= E6[f3] - 1;
    }
  }
  let s3 = g5 + R5, w5 = new Float64Array(s3), X2 = new Float64Array(s3), h7 = new Uint8Array(s3), S5 = new Int32Array(s3), u2 = 0;
  for (let n2 = 0; n2 < g5; n2++) {
    let f3 = l4[n2];
    w5[n2] = f3.w, X2[n2] = f3.h, h7[n2] = f3.kind, S5[n2] = f3.rank, f3.rank > u2 && (u2 = f3.rank);
  }
  let D4 = 0;
  for (let n2 = 0; n2 < b4; n2++) y6[n2] || (D4 += E6[n2]);
  let _5 = new Int32Array(D4), z4 = new Int32Array(D4), q5 = new Float64Array(D4), p4 = new Float64Array(D4), T5 = new Int32Array(b4).fill(-1), N4 = new Uint8Array(u2 + 1), I5 = new Int32Array(b4).fill(-1), V3 = false;
  for (let n2 = 0; n2 < g5; n2++) l4[n2].span > 0 && l4[n2].kind === 0 && (V3 = true);
  let P4 = V3 ? new Uint8Array(D4) : void 0, C6 = V3 ? new Uint8Array(D4) : void 0, c3 = new Int32Array(b4).fill(-1), L5 = new Int32Array(b4).fill(-1), r2 = false;
  {
    let n2 = g5, f3 = 0;
    for (let M6 = 0; M6 < b4; M6++) {
      if (y6[M6]) continue;
      let B4 = A6[M6], Y3 = B4.reversed ? B4.head : B4.tail, et2 = B4.reversed ? B4.tail : B4.head, ft2 = B4.reversed ? B4.headDx : B4.tailDx, nt2 = B4.reversed ? B4.tailDx : B4.headDx;
      (ft2 !== 0 || nt2 !== 0) && (r2 = true);
      let it2 = S5[Y3], ht2 = S5[et2], pt2 = -1;
      B4.labelW > 0 && (pt2 = it2 + (ht2 - it2 >> 1), F3 === 2 && ht2 - it2 >= 4 ? (pt2 & 1) === 1 && (pt2 += B4.reversed ? 1 : -1) : F3 === 2 && (pt2 & 1) === 0 && (pt2 += B4.reversed ? 1 : -1));
      let kt2 = Y3;
      ht2 - it2 > 1 && (T5[M6] = n2), c3[M6] = f3, P4 && !(B4.reversed ? B4.headFixed : B4.tailFixed) && (P4[f3] = B4.reversed ? 2 : 1);
      for (let Dt2 = it2 + 1; Dt2 < ht2; Dt2++) {
        let xt2 = n2++;
        S5[xt2] = Dt2, Dt2 === pt2 ? (w5[xt2] = B4.labelW, X2[xt2] = B4.labelH, h7[xt2] = 2, I5[M6] = xt2, N4[Dt2] |= B4.reversed ? 2 : 1) : h7[xt2] = 1, _5[f3] = kt2, z4[f3] = xt2, q5[f3] = kt2 === Y3 ? ft2 : 0, f3++, kt2 = xt2;
      }
      _5[f3] = kt2, z4[f3] = et2, q5[f3] = kt2 === Y3 ? ft2 : 0, p4[f3] = nt2, C6 && !(B4.reversed ? B4.tailFixed : B4.headFixed) && (C6[f3] = B4.reversed ? 1 : 2), L5[M6] = f3, f3++;
    }
  }
  let a2 = new Int32Array(s3 + 1), $4 = new Int32Array(s3 + 1);
  for (let n2 = 0; n2 < D4; n2++) a2[_5[n2] + 1]++, $4[z4[n2] + 1]++;
  for (let n2 = 0; n2 < s3; n2++) a2[n2 + 1] += a2[n2], $4[n2 + 1] += $4[n2];
  let v4 = new Int32Array(D4), K3 = new Int32Array(D4);
  {
    let n2 = a2.slice(0, s3), f3 = $4.slice(0, s3);
    for (let M6 = 0; M6 < D4; M6++) v4[n2[_5[M6]]++] = M6, K3[f3[z4[M6]]++] = M6;
  }
  let W3 = new Int32Array(u2 + 2);
  for (let n2 = 0; n2 < s3; n2++) W3[S5[n2] + 1]++;
  for (let n2 = 0; n2 <= u2; n2++) W3[n2 + 1] += W3[n2];
  let o3 = new Int32Array(s3), O5 = new Int32Array(s3);
  {
    let n2 = new Int32Array(s3), f3 = W3.slice(0, u2 + 1);
    for (let Y3 = 0; Y3 < s3; Y3++) n2[f3[S5[Y3]]++] = Y3;
    f3.set(W3.subarray(0, u2 + 1));
    let M6 = new Uint8Array(s3), B4 = [];
    for (let Y3 = 0; Y3 < s3; Y3++) if (!M6[n2[Y3]]) for (B4.push(n2[Y3]); B4.length > 0; ) {
      let et2 = B4.pop();
      if (!M6[et2]) {
        M6[et2] = 1, o3[f3[S5[et2]]++] = et2;
        for (let ft2 = a2[et2 + 1] - 1; ft2 >= a2[et2]; ft2--) {
          let nt2 = z4[v4[ft2]];
          M6[nt2] || B4.push(nt2);
        }
      }
    }
  }
  let k4 = false;
  for (let n2 = 0; n2 < g5; n2++) l4[n2].pin !== 0 && (k4 = true);
  if (k4) for (let n2 = 0; n2 <= u2; n2++) {
    let f3 = Array.from(o3.subarray(W3[n2], W3[n2 + 1])), M6 = /* @__PURE__ */ new Map();
    f3.forEach((Y3, et2) => M6.set(Y3, et2));
    let B4 = (Y3) => Y3 < g5 ? l4[Y3].pin : 0;
    f3.sort((Y3, et2) => B4(Y3) - B4(et2) || M6.get(Y3) - M6.get(et2)), o3.set(f3, W3[n2]);
  }
  let G3 = () => {
    for (let n2 = 0; n2 <= u2; n2++) {
      let f3 = W3[n2];
      for (let M6 = f3, B4 = W3[n2 + 1]; M6 < B4; M6++) O5[o3[M6]] = M6 - f3;
    }
  };
  G3();
  let t = { n: s3, real: g5, maxRank: u2, W: w5, KIND: h7, RANK: S5, EF: _5, ET: z4, EFD: q5, ETD: p4, succStart: a2, succE: v4, predStart: $4, predE: K3, layerStart: W3, order: o3, pos: O5, offsets: r2 };
  D4 > 0 && u2 > 0 && (yn(t, l4), G3()), P4 && C6 && an(t, l4, P4, C6);
  let i5 = pn(t, e2), m5 = mn(t);
  if (P4 && C6) {
    let n2 = cn(t, P4, C6);
    ln(t, l4, i5, n2, e2, m5), fn(t, l4, i5, P4, C6, n2, m5), un(t, i5, m5, e2);
    for (let f3 = 0; f3 < b4; f3++) {
      if (y6[f3]) continue;
      let M6 = A6[f3], B4 = q5[c3[f3]], Y3 = p4[L5[f3]];
      M6.tailDx = M6.reversed ? Y3 : B4, M6.headDx = M6.reversed ? B4 : Y3;
    }
  }
  let U4 = new Uint8Array(s3);
  m5 && !e2.tracks && hn(t, i5, m5, T5, E6, e2.apart ? 0 : e2.edgeSep, U4), e2.tracks || dn(t, i5, T5, E6, e2.edgeSep, U4);
  let j4 = new Int32Array(b4 + 1), d4 = e2.tracks || P4 && !e2.straight ? { from: [], to: [], rank: [], lower: [], track: [], levels: [], wide: [] } : void 0, H4 = new Int32Array(u2 + 1);
  if (d4) {
    for (let n2 = 0; n2 < b4; n2++) {
      if (j4[n2] = d4.from.length, y6[n2]) continue;
      let f3 = T5[n2], M6 = false;
      for (let et2 = f3, ft2 = f3 < 0 ? f3 : f3 + E6[n2] - 1; et2 < ft2; et2++) {
        let nt2 = m5 !== void 0 && m5[S5[et2]] === 1;
        !e2.tracks && nt2 !== (U4[et2] === 1) && (M6 = true);
      }
      if (M6) continue;
      let B4 = i5[_5[c3[n2]]] + q5[c3[n2]], Y3 = S5[_5[c3[n2]]];
      for (let et2 = f3, ft2 = f3 < 0 ? f3 : f3 + E6[n2] - 1; et2 < ft2; et2++) m5 && m5[S5[et2]] || (d4.from.push(B4), d4.to.push(i5[et2]), d4.rank.push(Y3), d4.lower.push(et2), B4 = i5[et2], Y3 = S5[et2]);
      d4.from.push(B4), d4.to.push(i5[z4[L5[n2]]] + p4[L5[n2]]), d4.rank.push(Y3), d4.lower.push(-1);
    }
    j4[b4] = d4.from.length;
  }
  let at2 = (n2, f3) => {
    let M6 = false;
    for (let B4 = W3[n2]; B4 < W3[n2 + 1]; B4++) {
      let Y3 = h7[o3[B4]];
      if (Y3 === f3) M6 = true;
      else if (Y3 !== 1) return false;
    }
    return M6;
  }, rt3 = at2(0, 3) ? F3 : 0, ot2 = at2(u2, 4) ? F3 : 0, J2 = new Float64Array(u2 + 1);
  for (let n2 = 0; n2 < D4; n2++) {
    let f3 = Math.abs(i5[_5[n2]] + q5[n2] - i5[z4[n2]] - p4[n2]);
    f3 > J2[S5[_5[n2]]] && (J2[S5[_5[n2]]] = f3);
  }
  let st2 = new Float64Array(u2 + 1), x5 = new Float64Array(u2 + 1), Z4 = (n2) => (n2 < rt3 || n2 >= u2 - ot2 ? e2.portSep : e2.rankSep) / F3, tt2 = new Float64Array(u2 + 1);
  for (let n2 = 0; n2 < u2; n2++) tt2[n2] = d4 ? Z4(n2) : Math.max(Z4(n2), Math.min(Ot * e2.rankSep / F3, J2[n2] * Vt));
  let ct2 = new Uint8Array(u2 + 1).fill(1);
  for (let n2 = 0; n2 < g5; n2++) ct2[S5[n2]] = 0;
  for (let n2 = 1; n2 < u2; n2++) {
    if (e2.tracks || !ct2[n2] || N4[n2] !== 1 && N4[n2] !== 2) continue;
    let f3 = Math.min((e2.headRoom ?? 0) / 2, tt2[N4[n2] === 1 ? n2 - 1 : n2] / 2);
    tt2[n2 - 1] += N4[n2] === 1 ? -f3 : f3, tt2[n2] += N4[n2] === 1 ? f3 : -f3;
  }
  let lt3 = (n2) => h7[n2] === 1 && ct2[S5[n2]] && !e2.tracks ? (x5[S5[n2]] - st2[S5[n2]]) / 4 : 0, ut2 = e2.tracks ? qt : Jt, bt4 = e2.tracks ? zt : Wt, dt2 = e2.tracks ? Qt : Wt, yt3 = new Int32Array(u2 + 1);
  if (d4) {
    let n2 = new Float64Array(u2 + 1);
    for (let M6 = 0; M6 < u2; M6++) {
      if (m5 && m5[M6]) continue;
      let B4 = M6 + 1;
      for (n2[M6] = tt2[M6]; B4 < u2 && m5 && m5[B4]; ) n2[M6] += tt2[B4++];
      yt3[M6] = B4;
    }
    for (let M6 = 0; M6 < d4.from.length; M6++) d4.wide.push(Math.abs(d4.from[M6] - d4.to[M6]) > Zt * n2[d4.rank[M6]] ? 1 : 0);
    let f3 = new Float64Array(u2 + 1);
    bn(d4, H4, !e2.tracks, n2, f3);
    for (let M6 = 0; M6 < u2; M6++) H4[M6] > 0 ? tt2[M6] += Math.max(0, 2 * ut2 + (H4[M6] - 1) * bt4 - n2[M6]) : f3[M6] > 0 && (tt2[M6] += Math.max(0, Math.min(Ot * e2.rankSep, f3[M6]) - n2[M6]));
  }
  let gt3 = 0;
  for (let n2 = 0; n2 <= u2; n2++) {
    let f3 = 0;
    for (let M6 = W3[n2]; M6 < W3[n2 + 1]; M6++) X2[o3[M6]] > f3 && (f3 = X2[o3[M6]]);
    st2[n2] = gt3, x5[n2] = gt3 + f3, gt3 += f3 + tt2[n2];
  }
  let vt2 = gt3, Ft2 = (n2, f3 = d4.track[n2]) => {
    let M6 = d4.rank[n2], B4 = x5[M6], Y3 = st2[yt3[M6]], et2 = e2.tracks ? H4[M6] : d4.levels[n2], ft2 = et2 > 1 ? Math.min(dt2, (Y3 - B4 - 2 * ut2) / (et2 - 1)) : 0;
    return (B4 + Y3) / 2 + (f3 - (et2 - 1) / 2) * ft2;
  }, mt3 = 1 / 0, Et2 = -1 / 0;
  for (let n2 = 0; n2 < s3; n2++) {
    let f3 = w5[n2] / 2;
    i5[n2] - f3 < mt3 && (mt3 = i5[n2] - f3), i5[n2] + f3 > Et2 && (Et2 = i5[n2] + f3);
  }
  let It2 = new Uint8Array(u2 + 1), At2 = new Uint8Array(u2 + 1);
  for (let n2 = 0; n2 < g5; n2++) h7[n2] !== 0 || !P4 || ($4[n2 + 1] > $4[n2] && (It2[S5[n2]] = 1), a2[n2 + 1] > a2[n2] && (At2[S5[n2]] = 1));
  for (let n2 = 0; n2 < g5; n2++) {
    let f3 = l4[n2], M6 = f3.rank;
    f3.x = i5[n2] - mt3, h7[n2] === 0 && At2[M6] && !It2[M6] ? f3.y = x5[M6] - f3.h / 2 : h7[n2] === 0 && It2[M6] && !At2[M6] ? f3.y = st2[M6] + f3.h / 2 : f3.y = (st2[M6] + x5[M6]) / 2;
  }
  for (let n2 = 0; n2 < b4; n2++) {
    let f3 = A6[n2], M6 = l4[f3.reversed ? f3.head : f3.tail], B4 = l4[f3.reversed ? f3.tail : f3.head], Y3 = [M6.x + (f3.reversed ? f3.headDx : f3.tailDx), M6.y + M6.h / 2], et2 = T5[n2];
    if (d4 && j4[n2 + 1] > j4[n2]) for (let nt2 = j4[n2]; nt2 < j4[n2 + 1]; nt2++) {
      if (d4.track[nt2] >= 0 && (e2.tracks || d4.wide[nt2] === 1)) {
        let ht2 = Ft2(nt2);
        Y3.push(d4.from[nt2] - mt3, ht2, d4.to[nt2] - mt3, ht2);
      } else d4.track[nt2] > 0 && Y3.push(d4.from[nt2] - mt3, Ft2(nt2, d4.track[nt2] - 1));
      let it2 = d4.lower[nt2];
      it2 < 0 || (Y3.push(i5[it2] - mt3, st2[S5[it2]] + lt3(it2)), x5[S5[it2]] > st2[S5[it2]] && Y3.push(i5[it2] - mt3, x5[S5[it2]] - lt3(it2)));
    }
    else if (et2 >= 0) for (let nt2 = et2, it2 = et2 + E6[n2] - 1; nt2 < it2; nt2++) {
      if (U4[nt2]) continue;
      let ht2 = i5[nt2] - mt3, pt2 = st2[S5[nt2]], kt2 = x5[S5[nt2]];
      Y3.push(ht2, pt2 + lt3(nt2)), kt2 > pt2 && Y3.push(ht2, kt2 - lt3(nt2));
    }
    if (Y3.push(B4.x + (f3.reversed ? f3.tailDx : f3.headDx), B4.y - B4.h / 2), f3.reversed) for (let nt2 = 0, it2 = Y3.length - 2; nt2 < it2; nt2 += 2, it2 -= 2) {
      let ht2 = Y3[nt2], pt2 = Y3[nt2 + 1];
      Y3[nt2] = Y3[it2], Y3[nt2 + 1] = Y3[it2 + 1], Y3[it2] = ht2, Y3[it2 + 1] = pt2;
    }
    f3.points = Y3;
    let ft2 = I5[n2];
    ft2 >= 0 ? (f3.labelX = i5[ft2] - mt3, f3.labelY = (st2[S5[ft2]] + x5[S5[ft2]]) / 2) : f3.labelW > 0 && (f3.labelX = (Y3[0] + Y3[Y3.length - 2]) / 2, f3.labelY = (Y3[1] + Y3[Y3.length - 1]) / 2);
  }
  return { width: Et2 - mt3, height: vt2 };
}
function on(l4, A6) {
  let e2 = l4.length, g5 = A6.length, b4 = new Int32Array(e2 + 1);
  for (let s3 = 0; s3 < g5; s3++) {
    let w5 = A6[s3];
    w5.reversed = l4[w5.head].kind === 3 || l4[w5.tail].kind === 4, w5.reversed || b4[w5.tail + 1]++;
  }
  for (let s3 = 0; s3 < e2; s3++) b4[s3 + 1] += b4[s3];
  let F3 = new Int32Array(b4[e2]);
  {
    let s3 = b4.slice(0, e2);
    for (let w5 = 0; w5 < g5; w5++) A6[w5].reversed || (F3[s3[A6[w5].tail]++] = w5);
  }
  let E6 = new Uint8Array(e2), R5 = b4.slice(0, e2), y6 = [];
  for (let s3 = 0; s3 < e2; s3++) if (E6[s3] === 0) for (y6.push(s3), E6[s3] = 1; y6.length > 0; ) {
    let w5 = y6[y6.length - 1];
    if (R5[w5] < b4[w5 + 1]) {
      let X2 = A6[F3[R5[w5]++]], h7 = X2.head;
      E6[h7] === 1 ? X2.reversed = true : E6[h7] === 0 && (E6[h7] = 1, y6.push(h7));
    } else E6[w5] = 2, y6.pop();
  }
}
function sn(l4, A6, e2) {
  let g5 = l4.length, b4 = A6.length, F3 = new Int32Array(b4), E6 = new Int32Array(b4), R5 = new Int32Array(b4), y6 = new Int32Array(g5 + 1), s3 = new Int32Array(g5 + 1);
  for (let p4 = 0; p4 < b4; p4++) {
    let T5 = A6[p4], N4 = T5.reversed ? T5.head : T5.tail, I5 = T5.reversed ? T5.tail : T5.head;
    F3[p4] = N4, E6[p4] = I5, R5[p4] = Math.max(1, T5.minlen) * e2, y6[N4 + 1]++, s3[I5 + 1]++;
  }
  for (let p4 = 0; p4 < g5; p4++) y6[p4 + 1] += y6[p4], s3[p4 + 1] += s3[p4];
  let w5 = new Int32Array(b4), X2 = new Int32Array(b4);
  {
    let p4 = y6.slice(0, g5), T5 = s3.slice(0, g5);
    for (let N4 = 0; N4 < b4; N4++) w5[p4[F3[N4]]++] = N4, X2[T5[E6[N4]]++] = N4;
  }
  let h7 = new Int32Array(g5), S5 = new Int32Array(g5);
  for (let p4 = 0; p4 < g5; p4++) S5[p4] = s3[p4 + 1] - s3[p4];
  let u2 = new Int32Array(g5), D4 = 0;
  for (let p4 = 0; p4 < g5; p4++) S5[p4] === 0 && (u2[D4++] = p4);
  for (let p4 = 0; p4 < D4; p4++) {
    let T5 = u2[p4];
    for (let N4 = y6[T5]; N4 < y6[T5 + 1]; N4++) {
      let I5 = w5[N4], V3 = E6[I5];
      h7[T5] + R5[I5] > h7[V3] && (h7[V3] = h7[T5] + R5[I5]), --S5[V3] === 0 && (u2[D4++] = V3);
    }
  }
  for (let p4 = 0; p4 < 8; p4++) {
    let T5 = false;
    for (let N4 = D4 - 1; N4 >= 0; N4--) {
      let I5 = u2[N4], V3 = s3[I5 + 1] - s3[I5], P4 = y6[I5 + 1] - y6[I5];
      if (V3 === 0 && P4 === 0) continue;
      let C6 = -1 / 0, c3 = 1 / 0;
      for (let r2 = s3[I5]; r2 < s3[I5 + 1]; r2++) {
        let a2 = X2[r2];
        C6 = Math.max(C6, h7[F3[a2]] + R5[a2]);
      }
      for (let r2 = y6[I5]; r2 < y6[I5 + 1]; r2++) {
        let a2 = w5[r2];
        c3 = Math.min(c3, h7[E6[a2]] - R5[a2]);
      }
      let L5 = h7[I5];
      P4 > V3 && c3 !== 1 / 0 ? L5 = c3 : V3 > P4 && C6 !== -1 / 0 && (L5 = C6), L5 !== h7[I5] && (h7[I5] = L5, T5 = true);
    }
    if (!T5) break;
  }
  let _5 = 1 / 0, z4 = -1 / 0, q5 = false;
  for (let p4 = 0; p4 < g5; p4++) {
    let T5 = l4[p4].kind;
    T5 === 3 && (q5 = true), !(T5 === 3 || T5 === 4) && (h7[p4] < _5 && (_5 = h7[p4]), h7[p4] > z4 && (z4 = h7[p4]));
  }
  _5 === 1 / 0 && (_5 = 0, z4 = 0);
  for (let p4 = 0; p4 < g5; p4++) l4[p4].kind === 3 ? h7[p4] = _5 - e2 : l4[p4].kind === 4 && (h7[p4] = z4 + e2);
  q5 && (_5 -= e2);
  for (let p4 = 0; p4 < g5; p4++) l4[p4].rank = h7[p4] - _5;
}
function Xt(l4, A6, e2, g5, b4, F3, E6) {
  let R5 = e2 === 0 ? l4.predStart : l4.succStart, y6 = e2 === 0 ? l4.predE : l4.succE, s3 = e2 === 0 ? l4.EF : l4.ET, w5 = l4.pos;
  F3.length = 0;
  for (let u2 = R5[A6]; u2 < R5[A6 + 1]; u2++) b4[y6[u2]] !== 0 && F3.push(y6[u2]);
  if (F3.length < 2) return 0;
  F3.sort((u2, D4) => w5[s3[u2]] - w5[s3[D4]] || u2 - D4);
  let X2 = (u2) => {
    let D4 = 0;
    E6.length = F3.length, E6[0] = 0;
    for (let _5 = 1; _5 < F3.length; _5++) {
      let z4 = b4[F3[_5]] === b4[F3[_5 - 1]];
      E6[_5] = u2(z4 && b4[F3[_5]] === 1, z4), D4 += E6[_5];
    }
    return D4;
  }, h7 = X2(() => 1);
  if (g5 / h7 < Tt2 && (h7 = X2((u2) => u2 ? 0.5 : 1)), g5 / h7 < Tt2 && (h7 = X2((u2, D4) => D4 ? 0 : 1)), h7 === 0) return 0;
  let S5 = Math.min(Kt, g5 / h7);
  for (let u2 = 1; u2 < F3.length; u2++) E6[u2] *= S5;
  return h7 * S5;
}
function an(l4, A6, e2, g5) {
  let { real: b4, W: F3, EFD: E6, ETD: R5 } = l4, y6 = [], s3 = [];
  for (let w5 = 0; w5 < b4; w5++) {
    let X2 = Math.min(A6[w5].span, F3[w5]);
    if (!(X2 <= 0 || A6[w5].kind !== 0)) for (let h7 = 0; h7 < 2; h7++) {
      let S5 = Xt(l4, w5, h7, X2, h7 === 0 ? g5 : e2, y6, s3);
      if (S5 === 0) continue;
      let u2 = h7 === 0 ? R5 : E6, D4 = -S5 / 2;
      for (let _5 = 0; _5 < y6.length; _5++) D4 += s3[_5], u2[y6[_5]] = D4;
    }
  }
}
function $t2(l4, A6, e2, g5) {
  if (!A6) return e2;
  let { KIND: b4, RANK: F3, EF: E6, ET: R5, succStart: y6, succE: s3, predStart: w5, predE: X2 } = l4;
  for (let h7 = 0; h7 < 1e5; h7++) {
    let S5 = g5 === 0 ? E6[e2] : R5[e2];
    if (b4[S5] !== 1 || !A6[F3[S5]]) break;
    e2 = g5 === 0 ? X2[w5[S5]] : s3[y6[S5]];
  }
  return e2;
}
function cn(l4, A6, e2) {
  let g5 = [new Int32Array(l4.n), new Int32Array(l4.n)];
  for (let b4 = 0; b4 < l4.EF.length; b4++) e2[b4] !== 0 && g5[0][l4.ET[b4]]++, A6[b4] !== 0 && g5[1][l4.EF[b4]]++;
  return g5;
}
function Rt(l4, A6) {
  return Math.max(0.25, Math.min(0.5, 4 * Math.abs(A6) / (Math.abs(l4) || 1)));
}
function ln(l4, A6, e2, g5, b4, F3) {
  let E6 = b4.edgeSep, { n: R5, real: y6, maxRank: s3, KIND: w5, RANK: X2, W: h7, EF: S5, ET: u2, EFD: D4, ETD: _5, succStart: z4, succE: q5, predStart: p4, predE: T5, layerStart: N4, order: I5, pos: V3 } = l4, P4 = ($4) => w5[$4] === 2 || w5[$4] === 1 && !(F3 !== void 0 && F3[X2[$4]] === 1), C6 = ($4, v4) => {
    let K3 = v4 === 0 ? S5[$4] : u2[$4];
    return [v4 === 0 ? e2[K3] + D4[$4] : e2[K3] + _5[$4], K3 < y6 && A6[K3].kind === 0 ? g5[1 - v4][K3] : 0];
  }, c3 = ($4) => {
    let v4 = N4[X2[$4]], K3 = v4 + V3[$4], W3 = (o3) => h7[o3] / 2 + h7[$4] / 2 + (w5[o3] === 0 ? b4.nodeSep / 2 + E6 / 2 : w5[o3] === w5[$4] ? E6 : E6 / 2);
    return [K3 > v4 ? e2[I5[K3 - 1]] + W3(I5[K3 - 1]) : -1 / 0, K3 + 1 < N4[X2[$4] + 1] ? e2[I5[K3 + 1]] - W3(I5[K3 + 1]) : 1 / 0];
  }, L5 = ($4, v4, K3, W3, o3) => {
    let k4 = (v4[1] !== K3[1] ? v4[1] < K3[1] : Math.abs(v4[0] - $4) <= Math.abs(K3[0] - $4)) ? [v4[0], K3[0]] : [K3[0], v4[0]];
    return k4.find((G3) => G3 >= W3 && G3 <= o3) ?? Math.max(W3, Math.min(o3, k4[0]));
  }, r2 = new Uint8Array(R5), a2 = [];
  for (let $4 = 1; $4 < s3; $4++) for (let v4 = N4[$4]; v4 < N4[$4 + 1]; v4++) {
    if (!P4(I5[v4]) || r2[I5[v4]]) continue;
    let K3 = I5[v4];
    for (; Mt(w5[S5[T5[p4[K3]]]]); ) K3 = S5[T5[p4[K3]]];
    let W3 = K3, o3 = -1 / 0, O5 = 1 / 0;
    a2.length = 0;
    for (let k4 = K3; Mt(w5[k4]); k4 = u2[q5[z4[k4]]]) {
      if (W3 = k4, !P4(k4)) continue;
      r2[k4] = 1, a2.push(k4);
      let [G3, t] = c3(k4);
      G3 > o3 && (o3 = G3), t < O5 && (O5 = t);
    }
    if (o3 <= O5) {
      let k4 = L5(e2[a2[0]], C6(T5[p4[K3]], 0), C6(q5[z4[W3]], 1), o3, O5);
      for (let G3 of a2) e2[G3] = k4;
      continue;
    }
    for (let k4 of a2) {
      let [G3, t] = c3(k4);
      G3 > t || (e2[k4] = L5(e2[k4], C6($t2(l4, F3, T5[p4[k4]], 0), 0), C6($t2(l4, F3, q5[z4[k4]], 1), 1), G3, t));
    }
  }
}
function fn(l4, A6, e2, g5, b4, F3, E6) {
  let { real: R5, W: y6, EF: s3, ET: w5, EFD: X2, ETD: h7, succStart: S5, succE: u2, predStart: D4, predE: _5, pos: z4 } = l4, q5 = [], p4 = [], T5 = [], N4 = [], I5 = [], V3 = (P4, C6, c3, L5, r2) => {
    if (F3[C6][c3] < 2) return 0;
    P4 = $t2(l4, E6, P4, C6);
    let a2 = C6 === 0 ? s3[P4] : w5[P4], $4 = C6 === 0 ? e2[a2] + X2[P4] : e2[a2] + h7[P4];
    if (r2 && Math.abs($4 - e2[c3]) <= L5 / 2 + wt3) return Math.max(-L5 / 2, Math.min(L5 / 2, $4 - e2[c3]));
    let v4 = $4, K3 = 0;
    a2 < R5 && A6[a2].kind === 0 && (C6 === 0 ? g5 : b4)[P4] !== 0 && F3[1 - C6][a2] >= 2 && (K3 = Math.max(0, Math.min(A6[a2].span, y6[a2])), K3 > 0 && (v4 = e2[a2]));
    let W3 = Math.max(e2[c3] - L5 / 2, v4 - K3 / 2), o3 = Math.min(e2[c3] + L5 / 2, v4 + K3 / 2);
    if (W3 > o3 + wt3) {
      let k4 = Math.max(0, L5 / 2 - rn);
      return Math.max(-k4, Math.min(k4, $4 - e2[c3]));
    }
    let O5 = (e2[c3] * K3 + v4 * L5) / (K3 + L5);
    return Math.max(W3, Math.min(o3, O5)) - e2[c3];
  };
  for (let P4 = 0, C6 = true; C6 && P4 < 6; P4++) {
    C6 = false;
    for (let c3 = 0; c3 < R5; c3++) {
      let L5 = Math.min(A6[c3].span, y6[c3]);
      if (!(L5 <= 0 || A6[c3].kind !== 0)) for (let r2 = 0; r2 < 2; r2++) {
        let a2 = r2 === 0 ? b4 : g5, $4 = r2 === 0 ? h7 : X2, v4 = r2 === 0 ? s3 : w5, K3 = r2 === 0 ? D4 : S5, W3 = r2 === 0 ? _5 : u2;
        if (Xt(l4, c3, r2, L5, a2, q5, p4), q5.length === 0) continue;
        q5.length === 1 && (p4[0] = 0), T5.length = 0;
        for (let k4 = K3[c3]; k4 < K3[c3 + 1]; k4++) T5.push(W3[k4]);
        T5.sort((k4, G3) => z4[v4[k4]] - z4[v4[G3]] || k4 - G3);
        let o3 = 0, O5 = -L5 / 2;
        for (let k4 = 0; k4 <= T5.length; k4++) {
          let G3 = k4 < T5.length && a2[T5[k4]] === 0;
          if (k4 < T5.length && !G3) continue;
          let t = 0;
          for (let m5 = k4 - 1; m5 >= 0 && a2[T5[m5]] !== 0; m5--) t++;
          let i5 = G3 ? $4[T5[k4]] - Kt : L5 / 2;
          if (t > 0) {
            N4.length = 0, I5.length = 0;
            let m5 = 0;
            for (let d4 = 0; d4 < t; d4++) {
              d4 > 0 && (m5 += p4[o3 + d4]), N4.push(V3(q5[o3 + d4], r2, c3, L5, P4 > 0) - m5), I5.push(1);
              let H4 = d4 > 0 && p4[o3 + d4] === 0;
              for (; N4.length > 1 && (H4 || N4[N4.length - 2] / I5[I5.length - 2] > N4[N4.length - 1] / I5[I5.length - 1]); ) {
                H4 = false;
                let at2 = N4.pop(), rt3 = I5.pop();
                N4[N4.length - 1] += at2, I5[I5.length - 1] += rt3;
              }
            }
            let U4 = m5, j4 = 0;
            m5 = 0;
            for (let d4 = 0; d4 < N4.length; d4++) {
              let H4 = i5 - U4 < O5 ? (O5 + i5 - U4) / 2 : Math.max(O5, Math.min(i5 - U4, N4[d4] / I5[d4]));
              for (let at2 = 0; at2 < I5[d4]; at2++, j4++) j4 > 0 && (m5 += p4[o3 + j4]), Math.abs($4[q5[o3 + j4]] - H4 - m5) > 0.01 && (C6 = true), $4[q5[o3 + j4]] = H4 + m5;
            }
            o3 += t;
          }
          G3 && (O5 = $4[T5[k4]] + Kt);
        }
      }
    }
  }
}
function un(l4, A6, e2, g5) {
  let { n: b4, KIND: F3, RANK: E6, EF: R5, ET: y6, EFD: s3, ETD: w5, layerStart: X2, order: h7, pos: S5 } = l4, u2 = (c3) => e2 !== void 0 && F3[c3] === 1 && e2[E6[c3]] === 1, D4 = [], _5 = [], z4 = [], q5 = [];
  for (let c3 = 0; c3 < R5.length; c3++) {
    if (u2(R5[c3])) continue;
    let L5 = $t2(l4, e2, c3, 1);
    D4.push(R5[c3]), _5.push(y6[L5]), z4.push(s3[c3]), q5.push(w5[L5]);
  }
  let p4 = (c3) => A6[_5[c3]] + q5[c3] - A6[D4[c3]] - z4[c3], T5 = new Int32Array(b4), N4 = [];
  for (let c3 = 0; c3 < b4; c3++) T5[c3] = c3, N4.push([c3]);
  let I5 = (c3, L5) => {
    let r2 = T5[c3], a2 = T5[L5];
    if (r2 !== a2) {
      N4[r2].length < N4[a2].length && ([r2, a2] = [a2, r2]);
      for (let $4 of N4[a2]) T5[$4] = r2, N4[r2].push($4);
      N4[a2] = [];
    }
  }, V3 = [];
  for (let c3 = 0; c3 < D4.length; c3++) {
    let L5 = Math.abs(p4(c3));
    L5 < 0.01 ? I5(D4[c3], _5[c3]) : L5 <= Gt && V3.push(c3);
  }
  if (V3.length === 0) return;
  V3.sort((c3, L5) => Math.abs(p4(c3)) - Math.abs(p4(L5)) || c3 - L5);
  let P4 = (c3) => Yt(l4, g5, c3), C6 = (c3, L5) => {
    for (let r2 of N4[c3]) {
      let a2 = X2[E6[r2]], $4 = X2[E6[r2] + 1], v4 = a2 + S5[r2];
      if (v4 > a2 && T5[h7[v4 - 1]] !== c3 && A6[r2] + L5 - A6[h7[v4 - 1]] < P4(r2) + P4(h7[v4 - 1]) - 0.01 || v4 + 1 < $4 && T5[h7[v4 + 1]] !== c3 && A6[h7[v4 + 1]] - A6[r2] - L5 < P4(r2) + P4(h7[v4 + 1]) - 0.01) return false;
    }
    return true;
  };
  for (let c3 of V3) {
    let L5 = p4(c3);
    if (Math.abs(L5) < 0.01) {
      I5(D4[c3], _5[c3]);
      continue;
    }
    if (Math.abs(L5) > Gt || T5[D4[c3]] === T5[_5[c3]]) continue;
    let r2 = T5[D4[c3]], a2 = T5[_5[c3]], $4 = N4[r2].length <= N4[a2].length ? r2 : a2;
    for (let v4 of [$4, $4 === r2 ? a2 : r2]) {
      let K3 = v4 === r2 ? L5 : -L5;
      if (C6(v4, K3)) {
        for (let W3 of N4[v4]) A6[W3] += K3;
        I5(D4[c3], _5[c3]);
        break;
      }
    }
  }
}
function mn(l4) {
  let { maxRank: A6, KIND: e2, layerStart: g5, order: b4 } = l4, F3 = new Uint8Array(A6 + 1), E6 = false;
  for (let R5 = 1; R5 < A6; R5++) {
    let y6 = g5[R5 + 1] > g5[R5];
    for (let s3 = g5[R5]; y6 && s3 < g5[R5 + 1]; s3++) e2[b4[s3]] !== 1 && (y6 = false);
    y6 && (F3[R5] = 1, E6 = true);
  }
  return E6 ? F3 : void 0;
}
function bn(l4, A6, e2, g5, b4) {
  let { from: F3, to: E6, rank: R5, track: y6, levels: s3, wide: w5 } = l4, X2 = F3.length, h7 = /* @__PURE__ */ new Map();
  for (let r2 = 0; r2 < X2; r2++) {
    if (y6.push(-1), s3.push(0), Math.abs(F3[r2] - E6[r2]) < wt3) continue;
    let a2 = h7.get(R5[r2]);
    a2 ? a2.push(r2) : h7.set(R5[r2], [r2]);
  }
  let S5 = new Float64Array(X2), u2 = new Float64Array(X2);
  for (let r2 = 0; r2 < X2; r2++) S5[r2] = Math.min(F3[r2], E6[r2]), u2[r2] = Math.max(F3[r2], E6[r2]);
  let D4 = (r2, a2) => r2 >= S5[a2] - wt3 && r2 <= u2[a2] + wt3 ? 1 : 0, _5 = (r2, a2) => Math.abs(F3[r2] - F3[a2]) < wt3 || Math.abs(E6[r2] - E6[a2]) < wt3, z4 = (r2, a2) => S5[r2] < u2[a2] - wt3 && S5[a2] < u2[r2] - wt3, q5 = (r2, a2) => z4(r2, a2) && !_5(r2, a2), p4 = (r2, a2) => z4(r2, a2) || D4(E6[r2], a2) + D4(F3[a2], r2) + D4(E6[a2], r2) + D4(F3[r2], a2) > 0, T5 = (r2, a2) => D4(E6[r2], a2) + D4(F3[a2], r2), N4 = (r2) => {
    r2.sort((t, i5) => u2[i5] - S5[i5] - (u2[t] - S5[t]) || S5[t] - S5[i5] || t - i5);
    let a2 = r2.length, $4 = [], v4 = r2.map((t, i5) => i5), K3 = (t) => {
      for (; v4[t] !== t; ) t = v4[t] = v4[v4[t]];
      return t;
    }, W3 = r2;
    if (a2 <= jt2) {
      let t = new Int32Array(a2), i5 = [];
      for (let j4 = 0; j4 < a2; j4++) $4.push([]), i5.push([]);
      for (let j4 = 0; j4 < a2; j4++) for (let d4 = j4 + 1; d4 < a2; d4++) {
        let H4 = r2[j4], at2 = r2[d4];
        if (!p4(H4, at2)) continue;
        v4[K3(j4)] = K3(d4);
        let rt3 = T5(H4, at2), ot2 = T5(at2, H4);
        if (rt3 === ot2) continue;
        let J2 = rt3 < ot2 ? j4 : d4, st2 = rt3 < ot2 ? d4 : j4;
        $4[st2].push(J2), i5[J2].push(st2), t[st2]++;
      }
      let m5 = new Uint8Array(a2), U4 = [];
      for (let j4 = 0; j4 < a2; j4++) {
        let d4 = -1;
        for (let H4 = 0; H4 < a2 && !(!m5[H4] && ((d4 < 0 || t[H4] < t[d4]) && (d4 = H4), t[H4] === 0)); H4++) ;
        m5[d4] = 1, U4.push(d4);
        for (let H4 of i5[d4]) t[H4]--;
      }
      W3 = U4.map((j4) => r2[j4]);
    }
    let o3 = /* @__PURE__ */ new Map();
    r2.forEach((t, i5) => o3.set(t, i5));
    let O5 = [];
    for (let t of W3) {
      let i5 = 0;
      for (let m5 of $4[o3.get(t)] ?? []) y6[r2[m5]] >= i5 && (i5 = y6[r2[m5]] + 1);
      for (; ; i5++) {
        let m5 = O5[i5] ?? (O5[i5] = []), U4 = true;
        for (let j4 of m5) q5(t, j4) && (U4 = false);
        if (U4) {
          m5.push(t);
          break;
        }
      }
      y6[t] = i5;
    }
    let k4 = /* @__PURE__ */ new Map(), G3 = /* @__PURE__ */ new Map();
    return r2.forEach((t, i5) => {
      let m5 = K3(i5);
      k4.set(m5, Math.min(k4.get(m5) ?? 1 / 0, y6[t])), G3.set(m5, Math.max(G3.get(m5) ?? -1 / 0, y6[t]));
    }), r2.forEach((t, i5) => {
      let m5 = K3(i5);
      s3[t] = G3.get(m5) - k4.get(m5) + 1, e2 && (y6[t] -= k4.get(m5));
    }), O5.length;
  }, I5 = 16, V3 = (r2, a2, $4) => {
    let v4 = Rt(E6[r2] - F3[r2], a2);
    for (let K3 = 0; K3 <= I5; K3++) {
      let W3 = K3 / I5, o3 = 1 - W3;
      $4[2 * K3] = F3[r2] + (E6[r2] - F3[r2]) * W3 * W3 * (3 - 2 * W3), $4[2 * K3 + 1] = a2 * (3 * v4 * W3 * o3 * o3 + 3 * (1 - v4) * W3 * W3 * o3 + W3 * W3 * W3);
    }
  }, P4 = new Float64Array(2 * I5 + 2), C6 = new Float64Array(2 * I5 + 2), c3 = (r2, a2) => {
    let $4 = 1 / 0;
    for (let v4 = 0; v4 <= I5; v4++) {
      let K3 = r2[2 * v4], W3 = r2[2 * v4 + 1];
      for (let o3 = 0; o3 < I5; o3++) {
        let O5 = a2[2 * o3 + 2] - a2[2 * o3], k4 = a2[2 * o3 + 3] - a2[2 * o3 + 1], G3 = Math.max(0, Math.min(1, ((K3 - a2[2 * o3]) * O5 + (W3 - a2[2 * o3 + 1]) * k4) / (O5 * O5 + k4 * k4 || 1))), t = Math.hypot(K3 - a2[2 * o3] - G3 * O5, W3 - a2[2 * o3 + 1] - G3 * k4);
        t < $4 && ($4 = t);
      }
    }
    return $4;
  }, L5 = (r2, a2, $4) => {
    let v4 = Math.max($4 / 2, $4 - 2 * tn);
    return V3(r2, v4, P4), V3(a2, v4, C6), Math.min(c3(P4, C6), c3(C6, P4));
  };
  for (let [r2, a2] of h7) {
    if (!e2) {
      A6[r2] = N4(a2);
      continue;
    }
    if (a2.length > jt2) continue;
    let $4 = a2.filter((t) => w5[t] === 1);
    N4($4);
    let v4 = new Set($4.filter((t) => s3[t] > 1));
    for (let t = 0; t < a2.length; t++) for (let i5 = t + 1; i5 < a2.length; i5++) {
      let m5 = a2[t], U4 = a2[i5];
      v4.has(m5) && v4.has(U4) || !q5(m5, U4) || F3[m5] < E6[m5] != F3[U4] < E6[U4] || L5(m5, U4, g5[r2]) < (w5[m5] === 1 || w5[U4] === 1 ? nn : en) && v4.add(m5).add(U4);
    }
    for (let t of $4) y6[t] = -1, s3[t] = 0;
    if (v4.size === 0) continue;
    let K3 = 0, W3 = 0, o3 = [...v4];
    for (let t = 0; t < o3.length; t++) for (let i5 = t + 1; i5 < o3.length; i5++) {
      let m5 = o3[t], U4 = o3[i5];
      z4(m5, U4) && (F3[m5] < E6[m5] != F3[U4] < E6[U4] ? K3++ : _5(m5, U4) || W3++);
    }
    if (K3 > W3) {
      for (let t of a2) (u2[t] - S5[t]) * Ht > b4[r2] && (b4[r2] = (u2[t] - S5[t]) * Ht);
      continue;
    }
    let O5 = (t) => {
      for (let i5 of v4) if (p4(t, i5)) return true;
      return false;
    }, k4 = a2.filter((t) => v4.has(t) || w5[t] !== 1 && O5(t));
    N4(k4);
    let G3 = 0;
    for (let t of k4) s3[t] > G3 && (G3 = s3[t]);
    A6[r2] = G3;
  }
}
function hn(l4, A6, e2, g5, b4, F3, E6) {
  let { maxRank: R5, EF: y6, ET: s3, EFD: w5, ETD: X2, succStart: h7, succE: S5, predStart: u2, predE: D4, layerStart: _5, order: z4 } = l4, q5 = new Float64Array(A6.length), p4 = new Float64Array(A6.length), T5 = new Float64Array(A6.length);
  for (let I5 = 0; I5 < g5.length; I5++) {
    let V3 = g5[I5];
    if (V3 < 0) continue;
    let P4 = V3 + b4[I5] - 1, C6 = l4.RANK[V3];
    for (let c3 = V3; c3 < P4; c3++) {
      if (!e2[C6 + c3 - V3]) continue;
      let L5 = c3;
      for (; L5 + 1 < P4 && e2[C6 + L5 + 1 - V3]; ) L5++;
      let r2 = D4[u2[c3]], a2 = S5[h7[L5]], $4 = A6[y6[r2]] + w5[r2], v4 = A6[s3[a2]] + X2[a2], K3 = L5 - c3 + 2;
      for (let W3 = c3; W3 <= L5; W3++) q5[W3] = $4 + (v4 - $4) * (W3 - c3 + 1) / K3, p4[W3] = $4, T5[W3] = v4;
      c3 = L5;
    }
  }
  let N4 = [];
  for (let I5 = 1; I5 < R5; I5++) {
    if (!e2[I5]) continue;
    let V3 = _5[I5], P4 = _5[I5 + 1], C6 = Array.from(z4.subarray(V3, P4)).sort((c3, L5) => p4[c3] - p4[L5] || T5[c3] - T5[L5] || c3 - L5);
    for (let c3 = 0; c3 < C6.length; ) {
      N4.length = 0;
      let L5 = c3;
      for (; L5 < C6.length && Math.abs(p4[C6[L5]] - p4[C6[c3]]) < 1 && Math.abs(T5[C6[L5]] - T5[C6[c3]]) < 1; L5++) N4.push(C6[L5]);
      N4.sort((r2, a2) => l4.pos[r2] - l4.pos[a2]);
      for (let r2 = 0; r2 < N4.length; r2++) {
        let a2 = N4[r2];
        A6[a2] = q5[a2] + (r2 - (N4.length - 1) / 2) * F3, (N4.length === 1 || F3 === 0) && (E6[a2] = 1);
      }
      c3 = L5;
    }
  }
}
function dn(l4, A6, e2, g5, b4, F3) {
  let { maxRank: E6, W: R5, KIND: y6, RANK: s3, EF: w5, ET: X2, EFD: h7, ETD: S5, succStart: u2, succE: D4, predStart: _5, predE: z4, layerStart: q5, order: p4 } = l4, T5 = new Uint8Array(E6 + 1), N4 = false;
  for (let I5 = 1; I5 < E6; I5++) {
    let V3 = false, P4 = false;
    for (let C6 = q5[I5]; C6 < q5[I5 + 1]; C6++) {
      let c3 = y6[p4[C6]];
      c3 === 2 ? V3 = true : c3 !== 1 && (P4 = true);
    }
    V3 && !P4 && (T5[I5] = 1, N4 = true);
  }
  if (N4) for (let I5 = 0; I5 < e2.length; I5++) {
    let V3 = e2[I5];
    if (!(V3 < 0)) for (let P4 = V3, C6 = V3 + g5[I5] - 1; P4 < C6; P4++) {
      if (y6[P4] !== 1 || !T5[s3[P4]]) continue;
      let c3 = P4, L5 = P4;
      for (; c3 > V3 && F3[c3 - 1]; ) c3--;
      for (; L5 + 1 < C6 && F3[L5 + 1]; ) L5++;
      let r2 = z4[_5[c3]], a2 = D4[u2[L5]], $4 = A6[w5[r2]] + h7[r2], v4 = A6[X2[a2]] + S5[a2], K3 = Math.min($4, v4) - b4, W3 = Math.max($4, v4) + b4, o3 = true, O5 = s3[P4];
      for (let G3 = q5[O5]; o3 && G3 < q5[O5 + 1]; G3++) {
        let t = p4[G3];
        y6[t] === 2 && A6[t] + R5[t] / 2 > K3 && A6[t] - R5[t] / 2 < W3 && (o3 = false);
      }
      if (!o3) continue;
      F3[P4] = 1;
      let k4 = L5 - c3 + 2;
      for (let G3 = c3; G3 <= L5; G3++) A6[G3] = $4 + (v4 - $4) * (G3 - c3 + 1) / k4;
    }
  }
}
function yn(l4, A6) {
  let { n: e2, real: g5, maxRank: b4, W: F3, EF: E6, ET: R5, EFD: y6, ETD: s3, succStart: w5, succE: X2, predStart: h7, predE: S5, layerStart: u2, order: D4, pos: _5, offsets: z4 } = l4, q5 = 0;
  for (let t = 0; t <= b4; t++) q5 = Math.max(q5, u2[t + 1] - u2[t]);
  let p4 = z4 ? new Int32Array(E6.length) : void 0, T5 = 1;
  for (; T5 < (p4 ? q5 + E6.length : q5); ) T5 <<= 1;
  let N4 = new Int32Array(2 * T5), I5 = new Int32Array(E6.length), V3 = () => {
    let t = 0;
    for (let i5 = 0; i5 < b4; i5++) {
      let m5 = u2[i5 + 2] - u2[i5 + 1];
      if (p4) {
        let d4 = 0;
        for (let H4 = u2[i5 + 1]; H4 < u2[i5 + 2]; H4++) {
          let at2 = h7[D4[H4]], rt3 = h7[D4[H4] + 1], ot2 = false;
          for (let J2 = at2 + 1; J2 < rt3; J2++) s3[S5[J2]] !== s3[S5[at2]] && (ot2 = true);
          if (ot2) {
            let J2 = Array.from(S5.subarray(at2, rt3));
            J2.sort((st2, x5) => s3[st2] - s3[x5]);
            for (let st2 = 0; st2 < J2.length; st2++) st2 > 0 && s3[J2[st2]] !== s3[J2[st2 - 1]] && d4++, p4[J2[st2]] = d4;
          } else for (let J2 = at2; J2 < rt3; J2++) p4[S5[J2]] = d4;
          d4++;
        }
        m5 = d4;
      }
      if (m5 < 2) continue;
      let U4 = 0;
      for (let d4 = u2[i5]; d4 < u2[i5 + 1]; d4++) {
        let H4 = D4[d4], at2 = w5[H4], rt3 = w5[H4 + 1], ot2 = U4;
        for (let x5 = at2; x5 < rt3; x5++) I5[U4++] = p4 ? p4[X2[x5]] : _5[R5[X2[x5]]];
        let J2 = U4 - ot2;
        if (J2 < 2) continue;
        let st2 = false;
        if (p4) for (let x5 = at2 + 1; x5 < rt3; x5++) y6[X2[x5]] !== y6[X2[at2]] && (st2 = true);
        if (p4 && st2) {
          let x5 = Array.from(X2.subarray(at2, rt3));
          x5.sort((Z4, tt2) => y6[Z4] - y6[tt2] || p4[Z4] - p4[tt2]);
          for (let Z4 = 0; Z4 < J2; Z4++) I5[ot2 + Z4] = p4[x5[Z4]];
        } else if (J2 <= 12) for (let x5 = ot2 + 1; x5 < U4; x5++) {
          let Z4 = I5[x5], tt2 = x5 - 1;
          for (; tt2 >= ot2 && I5[tt2] > Z4; ) I5[tt2 + 1] = I5[tt2], tt2--;
          I5[tt2 + 1] = Z4;
        }
        else I5.subarray(ot2, U4).sort();
      }
      if (U4 < 2) continue;
      let j4 = 1;
      for (; j4 < m5; ) j4 <<= 1;
      N4.fill(0, 0, 2 * j4);
      for (let d4 = 0; d4 < U4; d4++) {
        let H4 = I5[d4] + j4;
        for (N4[H4]++; H4 > 1; ) (H4 & 1) === 0 && (t += N4[H4 + 1]), H4 >>= 1, N4[H4]++;
      }
    }
    return t;
  }, P4 = V3();
  if (P4 === 0) return;
  let C6 = D4.slice(), c3 = new Float64Array(e2), L5 = new Int32Array(q5), r2 = (t, i5) => c3[t] - c3[i5] || _5[t] - _5[i5], a2 = (t, i5) => c3[t] - c3[i5] || _5[i5] - _5[t], $4 = (t, i5) => {
    let m5 = t ? h7 : w5, U4 = t ? S5 : X2, j4 = t ? E6 : R5, d4 = t ? y6 : s3;
    for (let H4 = 1; H4 <= b4; H4++) {
      let at2 = t ? H4 : b4 - H4, rt3 = u2[at2], ot2 = u2[at2 + 1], J2 = 0;
      for (let x5 = rt3; x5 < ot2; x5++) {
        let Z4 = D4[x5], tt2 = Z4 < g5 ? A6[Z4].pin : 0;
        if (tt2 !== 0) {
          c3[Z4] = tt2 * 1e9, L5[J2++] = Z4;
          continue;
        }
        let ct2 = m5[Z4], lt3 = m5[Z4 + 1];
        if (ct2 === lt3) {
          c3[Z4] = -1;
          continue;
        }
        let ut2 = 0;
        for (let bt4 = ct2; bt4 < lt3; bt4++) {
          let dt2 = j4[U4[bt4]];
          ut2 += _5[dt2], z4 && F3[dt2] > 0 && (ut2 += d4[U4[bt4]] / F3[dt2]);
        }
        c3[Z4] = ut2 / (lt3 - ct2), L5[J2++] = Z4;
      }
      if (J2 < 2) continue;
      L5.subarray(0, J2).sort(i5 ? a2 : r2);
      let st2 = 0;
      for (let x5 = rt3; x5 < ot2; x5++) c3[D4[x5]] !== -1 && (D4[x5] = L5[st2++]);
      for (let x5 = rt3; x5 < ot2; x5++) _5[D4[x5]] = x5 - rt3;
    }
  }, v4 = () => {
    let t = 0;
    for (let i5 = 0; i5 <= b4; i5++) for (let m5 = u2[i5]; m5 < u2[i5 + 1]; m5++) if (!(D4[m5] >= g5)) for (let U4 = m5 + 1; U4 < u2[i5 + 1]; U4++) D4[U4] < D4[m5] && t++;
    return t;
  }, K3 = () => {
    for (let t = 0; t <= b4; t++) for (let i5 = u2[t]; i5 < u2[t + 1]; i5++) _5[D4[i5]] = i5 - u2[t];
  }, W3 = D4.slice(), o3 = P4, O5 = e2 <= 600, k4 = C6, G3 = 1 / 0;
  for (let t = 0; t < (O5 ? 2 : 1); t++) {
    t > 0 && (D4.set(W3), K3());
    let i5 = o3, m5 = W3.slice();
    for (let j4 = 0, d4 = 0; d4 < 4 && j4 < Bt; j4++, d4++) {
      $4((j4 + t) % 2 === 0, j4 % 4 >= 2);
      let H4 = V3();
      if (H4 < i5 && (i5 = H4, m5.set(D4), d4 = 0, H4 === 0)) break;
    }
    D4.set(m5);
    let U4 = O5 ? v4() : 0;
    (t === 0 || i5 < P4 || i5 === P4 && U4 < G3) && (P4 = i5, k4 = m5, G3 = U4);
  }
  if (D4.set(k4), K3(), C6.set(k4), !!O5) {
    for (let t = 0; t < g5; t++) if (A6[t].pin !== 0) return;
    if (G3 !== 0) {
      for (let t = 0; t <= b4; t++) D4.subarray(u2[t], u2[t + 1]).reverse();
      K3(), (V3() > P4 || v4() >= G3) && D4.set(C6);
    }
  }
}
function Yt(l4, A6, e2) {
  return l4.W[e2] / 2 + (l4.KIND[e2] === 0 ? A6.nodeSep : A6.edgeSep) / 2;
}
function pn(l4, A6) {
  let { n: e2, maxRank: g5, W: b4, KIND: F3, EF: E6, ET: R5, EFD: y6, ETD: s3, succStart: w5, succE: X2, predStart: h7, predE: S5, layerStart: u2, order: D4, pos: _5 } = l4, z4 = E6.length, q5 = new Float64Array(e2);
  for (let t = 0; t < e2; t++) q5[t] = Yt(l4, A6, t);
  let p4 = new Int32Array(z4);
  for (let t = 0; t < z4; t++) p4[t] = _5[R5[t]];
  for (let t = 0; t < e2; t++) w5[t + 1] - w5[t] > 1 && Ct(X2, w5[t], w5[t + 1], p4);
  for (let t = 0; t < z4; t++) p4[t] = _5[E6[t]];
  for (let t = 0; t < e2; t++) h7[t + 1] - h7[t] > 1 && Ct(S5, h7[t], h7[t + 1], p4);
  let T5 = new Uint8Array(z4);
  for (let t = 1; t <= g5; t++) {
    let i5 = u2[t] - u2[t - 1], m5 = u2[t], U4 = u2[t + 1], j4 = 0, d4 = m5;
    for (let H4 = m5; H4 < U4; H4++) {
      let at2 = D4[H4], rt3 = -1;
      if (Mt(F3[at2])) {
        let J2 = E6[S5[h7[at2]]];
        Mt(F3[J2]) && (rt3 = J2);
      }
      let ot2 = rt3 >= 0 ? _5[rt3] : i5;
      if (rt3 >= 0 || H4 === U4 - 1) {
        for (let J2 = d4; J2 <= H4; J2++) {
          let st2 = D4[J2], x5 = Mt(F3[st2]);
          for (let Z4 = h7[st2]; Z4 < h7[st2 + 1]; Z4++) {
            let tt2 = S5[Z4], ct2 = _5[E6[tt2]];
            (ct2 < j4 || ot2 < ct2) && !(x5 && Mt(F3[E6[tt2]])) && (T5[tt2] = 1);
          }
        }
        d4 = H4 + 1, j4 = ot2;
      }
    }
  }
  let N4 = [], I5 = new Int32Array(e2), V3 = new Int32Array(e2), P4 = new Float64Array(e2), C6 = new Int32Array(e2), c3 = new Int32Array(e2), L5 = new Float64Array(e2), r2 = new Int32Array(e2), a2 = new Int32Array(e2 + 1), $4 = new Int32Array(e2), v4 = new Int32Array(e2), K3 = new Int32Array(e2);
  for (let t = 0; t < 4; t++) {
    let i5 = t < 2, m5 = (t & 1) === 1, U4 = i5 ? h7 : w5, j4 = i5 ? S5 : X2, d4 = i5 ? E6 : R5, H4 = i5 ? s3 : y6, at2 = i5 ? y6 : s3;
    for (let x5 = 0; x5 < e2; x5++) I5[x5] = x5, V3[x5] = x5, P4[x5] = 0;
    for (let x5 = 0; x5 <= g5; x5++) {
      let Z4 = i5 ? x5 : g5 - x5, tt2 = u2[Z4], ct2 = u2[Z4 + 1], lt3 = i5 ? Z4 - 1 : Z4 + 1, ut2 = lt3 >= 0 && lt3 <= g5 ? u2[lt3 + 1] - u2[lt3] - 1 : 0, bt4 = -1;
      for (let dt2 = m5 ? ct2 - 1 : tt2; m5 ? dt2 >= tt2 : dt2 < ct2; m5 ? dt2-- : dt2++) {
        let yt3 = D4[dt2], gt3 = U4[yt3], vt2 = U4[yt3 + 1] - gt3;
        if (vt2 === 0) continue;
        let Ft2 = gt3 + (vt2 - 1 >> 1), mt3 = gt3 + (vt2 >> 1);
        for (let Et2 = 0; Et2 < 2 && !(Et2 === 1 && Ft2 === mt3); Et2++) {
          let It2 = j4[Et2 === 0 !== m5 ? Ft2 : mt3], At2 = d4[It2], n2 = m5 ? ut2 - _5[At2] : _5[At2];
          V3[yt3] === yt3 && bt4 < n2 && T5[It2] === 0 && (V3[At2] = yt3, V3[yt3] = I5[yt3] = I5[At2], P4[yt3] = P4[At2] + at2[It2] - H4[It2], bt4 = n2);
        }
      }
    }
    let rt3 = 0;
    r2.fill(0), a2.fill(0);
    for (let x5 = 0; x5 <= g5; x5++) {
      let Z4 = u2[x5], tt2 = u2[x5 + 1];
      for (let ct2 = Z4 + 1; ct2 < tt2; ct2++) {
        let lt3 = m5 ? D4[ct2] : D4[ct2 - 1], ut2 = m5 ? D4[ct2 - 1] : D4[ct2], bt4 = q5[lt3] + q5[ut2];
        C6[rt3] = I5[lt3], c3[rt3] = I5[ut2], L5[rt3] = m5 ? bt4 - P4[lt3] + P4[ut2] : bt4 + P4[lt3] - P4[ut2], r2[I5[ut2]]++, a2[I5[lt3] + 1]++, rt3++;
      }
    }
    for (let x5 = 0; x5 < e2; x5++) a2[x5 + 1] += a2[x5];
    v4.set(a2.subarray(0, e2));
    for (let x5 = 0; x5 < rt3; x5++) $4[v4[C6[x5]]++] = x5;
    let ot2 = new Float64Array(e2), J2 = 0;
    for (let x5 = 0; x5 < e2; x5++) I5[x5] === x5 && r2[x5] === 0 && (K3[J2++] = x5);
    for (let x5 = 0; x5 < J2; x5++) {
      let Z4 = K3[x5];
      for (let tt2 = a2[Z4]; tt2 < a2[Z4 + 1]; tt2++) {
        let ct2 = $4[tt2], lt3 = c3[ct2];
        ot2[Z4] + L5[ct2] > ot2[lt3] && (ot2[lt3] = ot2[Z4] + L5[ct2]), --r2[lt3] === 0 && (K3[J2++] = lt3);
      }
    }
    for (let x5 = J2 - 1; x5 >= 0; x5--) {
      let Z4 = K3[x5], tt2 = 1 / 0;
      for (let ct2 = a2[Z4]; ct2 < a2[Z4 + 1]; ct2++) {
        let lt3 = $4[ct2], ut2 = ot2[c3[lt3]] - L5[lt3];
        ut2 < tt2 && (tt2 = ut2);
      }
      tt2 !== 1 / 0 && tt2 > ot2[Z4] && (ot2[Z4] = tt2);
    }
    let st2 = new Float64Array(e2);
    for (let x5 = 0; x5 < e2; x5++) st2[x5] = (m5 ? -ot2[I5[x5]] : ot2[I5[x5]]) + P4[x5];
    N4.push(st2);
  }
  let W3 = 0, o3 = 1 / 0, O5 = [], k4 = [];
  for (let t = 0; t < 4; t++) {
    let i5 = 1 / 0, m5 = -1 / 0, U4 = N4[t];
    for (let j4 = 0; j4 < e2; j4++) {
      let d4 = b4[j4] / 2;
      U4[j4] - d4 < i5 && (i5 = U4[j4] - d4), U4[j4] + d4 > m5 && (m5 = U4[j4] + d4);
    }
    O5.push(i5), k4.push(m5), m5 - i5 < o3 && (o3 = m5 - i5, W3 = t);
  }
  for (let t = 0; t < 4; t++) {
    let i5 = (t & 1) === 0 ? O5[W3] - O5[t] : k4[W3] - k4[t];
    if (i5 !== 0) {
      let m5 = N4[t];
      for (let U4 = 0; U4 < e2; U4++) m5[U4] += i5;
    }
  }
  let G3 = new Float64Array(e2);
  for (let t = 0; t < e2; t++) {
    let i5 = N4[0][t], m5 = N4[1][t], U4 = N4[2][t], j4 = N4[3][t], d4;
    i5 > m5 && (d4 = i5, i5 = m5, m5 = d4), U4 > j4 && (d4 = U4, U4 = j4, j4 = d4), i5 > U4 && (d4 = i5, i5 = U4, U4 = d4), m5 > j4 && (d4 = m5, m5 = j4, j4 = d4), m5 > U4 && (d4 = m5, m5 = U4, U4 = d4), G3[t] = (m5 + U4) / 2;
  }
  return G3;
}
var St = 8;
var An = 12;
var Nt2 = 0.62;
var Lt = 6;
function vn() {
  let l4 = /* @__PURE__ */ new Map();
  return { add(A6, e2, g5) {
    let b4 = wn(g5);
    e2 >= 0 && b4 > 0 && b4 + Lt > (l4.get(A6 * 4 + e2) ?? 0) && l4.set(A6 * 4 + e2, b4 + Lt);
  }, of: (A6, e2) => e2 >= 0 ? l4.get(A6 * 4 + e2) ?? 0 : 0 };
}
function Fn(l4, A6, e2, g5, b4 = e2 > 0 ? e2 + Lt : 0, F3 = g5 > 0 ? g5 + Lt : 0) {
  let E6 = A6 === "linear", R5 = A6 === "step" || A6 === "stepBefore" || A6 === "stepAfter", y6 = [], s3 = [], w5 = [], X2 = (o3, O5, k4, G3) => Math.abs(o3 - k4) < 0.01 && Math.abs(O5 - G3) < 0.01;
  for (let o3 = 0; o3 < l4.length; o3 += 3) {
    let O5 = l4[o3], k4 = l4[o3 + 1], G3 = l4[o3 + 2], t = y6.length - 1;
    if (R5 && t >= 0 && Math.abs(O5 - y6[t]) >= 0.01 && Math.abs(k4 - s3[t]) >= 0.01) {
      let i5 = y6[t], m5 = s3[t], U4 = A6 === "stepBefore" ? m5 : A6 === "stepAfter" ? k4 : (m5 + k4) / 2, j4 = A6 === "stepBefore" ? i5 : A6 === "stepAfter" ? O5 : (i5 + O5) / 2, d4 = G3 === 0 ? [i5, U4, O5, U4] : [j4, m5, j4, k4];
      for (let H4 = 0; H4 < 4; H4 += 2) X2(d4[H4], d4[H4 + 1], i5, m5) || X2(d4[H4], d4[H4 + 1], O5, k4) || (y6.push(d4[H4]), s3.push(d4[H4 + 1]), w5.push(G3));
    }
    y6.push(O5), s3.push(k4), w5.push(G3);
  }
  let h7 = y6.length - 1, S5 = (o3) => Math.abs(y6[o3] - y6[o3 - 1]) < 0.01 || Math.abs(s3[o3] - s3[o3 - 1]) < 0.01, u2 = (o3) => E6 || S5(o3), D4 = (o3, O5, k4) => {
    if (!u2(Math.max(o3, O5))) return k4 === 0 ? [0, Math.sign(s3[O5] - s3[o3]) || 1] : [Math.sign(y6[O5] - y6[o3]) || 1, 0];
    let G3 = y6[O5] - y6[o3], t = s3[O5] - s3[o3], i5 = Math.hypot(G3, t) || 1;
    return [G3 / i5, t / i5];
  }, [_5, z4] = D4(0, 1, w5[1]), [q5, p4] = D4(h7 - 1, h7, w5[h7]), T5 = y6[0], N4 = s3[0], I5 = y6[h7], V3 = s3[h7];
  y6[0] += _5 * e2, s3[0] += z4 * e2, y6[h7] -= q5 * g5, s3[h7] -= p4 * g5;
  let P4 = (o3) => Math.abs(y6[o3] - y6[o3 - 1]) + Math.abs(s3[o3] - s3[o3 - 1]), C6 = (o3) => !E6 && o3 > 0 && o3 < h7 && S5(o3) && S5(o3 + 1) && P4(o3) >= 0.01 && P4(o3 + 1) >= 0.01 && Math.abs(y6[o3] - y6[o3 - 1]) < 0.01 != Math.abs(y6[o3 + 1] - y6[o3]) < 0.01, c3 = (o3, O5, k4) => Math.abs(y6[o3] - y6[o3 - 1]) * Math.abs(O5) + Math.abs(s3[o3] - s3[o3 - 1]) * Math.abs(k4), L5 = (o3, O5, k4) => {
    let G3 = Math.min(Math.max(0, o3 - Lt - O5), k4 / 4);
    return G3 + Math.min(o3 - O5 - G3, (k4 - G3) / 4);
  }, r2 = F3 > g5 && (!u2(h7) || C6(h7 - 1)) ? L5(F3, g5, c3(h7, q5, p4)) : 0, a2 = b4 > e2 && (!u2(1) || C6(1)) ? L5(b4, e2, c3(1, _5, z4)) : 0;
  r2 >= 1 && (y6.splice(h7, 0, y6[h7] - q5 * r2), s3.splice(h7, 0, s3[h7] - p4 * r2), w5.splice(h7, 0, w5[h7]), h7++), a2 >= 1 && (y6.splice(1, 0, y6[0] + _5 * a2), s3.splice(1, 0, s3[0] + z4 * a2), w5.splice(1, 0, w5[1]), h7++);
  let $4 = `M${m(y6[0])},${m(s3[0])}`, v4 = y6[0], K3 = s3[0], W3 = (o3, O5) => {
    X2(o3, O5, v4, K3) || ($4 += `L${m(o3)},${m(O5)}`, v4 = o3, K3 = O5);
  };
  for (let o3 = 1; o3 <= h7; o3++) {
    let O5 = y6[o3], k4 = s3[o3];
    if (!u2(o3)) {
      let d4 = w5[o3] === 0, H4 = d4 ? k4 - K3 : O5 - v4, at2 = Math.abs(H4) * Rt(d4 ? O5 - v4 : k4 - K3, H4), rt3 = d4 ? 0 : Math.sign(H4) * at2, ot2 = d4 ? Math.sign(H4) * at2 : 0;
      $4 += `C${m(v4 + rt3)},${m(K3 + ot2)} ${m(O5 - rt3)},${m(k4 - ot2)} ${m(O5)},${m(k4)}`, v4 = O5, K3 = k4;
      continue;
    }
    if (!C6(o3)) {
      if (o3 < h7 && S5(o3) && S5(o3 + 1) && (O5 - y6[o3 - 1]) * (y6[o3 + 1] - O5) + (k4 - s3[o3 - 1]) * (s3[o3 + 1] - k4) > 0) continue;
      W3(O5, k4);
      continue;
    }
    let G3 = C6(o3 - 1) ? P4(o3) / 2 : P4(o3), t = C6(o3 + 1) ? P4(o3 + 1) / 2 : P4(o3 + 1);
    R5 && (G3 = t = Math.min(An, G3, t));
    let [i5, m5] = D4(o3 - 1, o3, w5[o3]), [U4, j4] = D4(o3, o3 + 1, w5[o3 + 1]);
    W3(O5 - i5 * G3, k4 - m5 * G3), v4 = O5 + U4 * t, K3 = k4 + j4 * t, R5 ? $4 += `Q${m(O5)},${m(k4)} ${m(v4)},${m(K3)}` : $4 += `C${m(O5 - i5 * G3 * (1 - Nt2))},${m(k4 - m5 * G3 * (1 - Nt2))} ${m(O5 + U4 * t * (1 - Nt2))},${m(k4 + j4 * t * (1 - Nt2))} ${m(v4)},${m(K3)}`;
  }
  return { d: $4, sx: T5, sy: N4, sdx: -_5, sdy: -z4, ex: I5, ey: V3, edx: q5, edy: p4 };
}
function wn(l4) {
  return l4 === "arrow_point" ? St - 1 : l4 === "arrow_circle" ? St : l4 === "arrow_cross" ? 4 : 0;
}
function Dn(l4, A6, e2, g5, b4, F3) {
  let E6 = -b4, R5 = g5;
  if (l4 === "arrow_point") {
    let y6 = A6 - g5 * St, s3 = e2 - b4 * St, w5 = St * 0.42;
    return `<path class="pele-marker" d="M${m(A6)},${m(e2)}L${m(y6 + E6 * w5)},${m(s3 + R5 * w5)}L${m(y6 - E6 * w5)},${m(s3 - R5 * w5)}Z" fill="${F3}" stroke="none"/>`;
  }
  if (l4 === "arrow_circle") return `<circle class="pele-marker" cx="${m(A6 - g5 * 4)}" cy="${m(e2 - b4 * 4)}" r="3.5" fill="${F3}" stroke="none"/>`;
  if (l4 === "arrow_cross") {
    let y6 = A6 - g5 * 4, s3 = e2 - b4 * 4, w5 = 3.5, X2 = (g5 + E6) * w5, h7 = (b4 + R5) * w5, S5 = (g5 - E6) * w5, u2 = (b4 - R5) * w5;
    return `<path class="pele-marker" d="M${m(y6 - X2)},${m(s3 - h7)}L${m(y6 + X2)},${m(s3 + h7)}M${m(y6 - S5)},${m(s3 - u2)}L${m(y6 + S5)},${m(s3 + u2)}"/>`;
  }
  return "";
}
function Sn(l4, A6, e2, g5, b4, F3) {
  let E6 = A6.width + 8, R5 = A6.height;
  return `<g class="pele-edge-label" data-id="${y3(l4)}"><rect x="${m(e2 - E6 / 2)}" y="${m(g5 - R5 / 2)}" width="${m(E6)}" height="${m(R5)}" rx="3" fill="var(--_bg)"/>` + gt2(A6, e2, g5, b4, F3) + "</g>";
}
function Ln(l4, A6, e2, g5, b4, F3, E6, R5) {
  let y6 = (b4 ? A6 : e2) / 2, s3 = Math.min(y6 - 4, 8 + g5 * 6), w5 = F3 + g5 * 8, X2 = Math.hypot(w5, s3) || 1, h7 = (D4, _5) => b4 ? `${m(l4.x + _5)},${m(l4.y + e2 / 2 + D4)}` : `${m(l4.x + A6 / 2 + D4)},${m(l4.y + _5)}`, S5 = w5 / X2 * E6, u2 = s3 / X2 * E6;
  return b4 ? (R5.labelX = l4.x, R5.labelY = l4.y + e2 / 2 + w5 + 4 + R5.labelH / 2) : (R5.labelX = l4.x + A6 / 2 + w5 + 4 + R5.labelW / 2, R5.labelY = l4.y), { d: `M${h7(0, -s3)}C${h7(w5, -s3 * 2)} ${h7(w5, s3 * 2)} ${h7(S5, s3 + u2)}`, sx: b4 ? l4.x - s3 : l4.x + A6 / 2, sy: b4 ? l4.y + e2 / 2 : l4.y - s3, sdx: b4 ? 0 : -1, sdy: b4 ? -1 : 0, ex: b4 ? l4.x + s3 : l4.x + A6 / 2, ey: b4 ? l4.y + e2 / 2 : l4.y + s3, edx: b4 ? -s3 / X2 : -w5 / X2, edy: b4 ? -w5 / X2 : -s3 / X2 };
}

// node_modules/pele/dist/esm/chunks/UY54MIDN.js
function be(r2) {
  return r2 === "BT" || r2 === "LR" || r2 === "RL" ? r2 : "TB";
}
var ce = 4e4;
function pe2(r2, p4, B4, X2) {
  for (let m5 of r2) m5.x += B4, m5.y += X2;
  for (let m5 of p4) {
    for (let h7 = 0; h7 < m5.route.length; h7 += 3) m5.route[h7] += B4, m5.route[h7 + 1] += X2;
    m5.labelX += B4, m5.labelY += X2;
  }
}
function de2(r2, p4, B4 = -1) {
  return { w: r2, h: p4, parent: B4, isGroup: false, dir: void 0, padX: 0, padTop: 0, padBottom: 0, minW: 0, seq: 0, span: 0, x: 0, y: 0 };
}
function se2(r2) {
  return r2 === "TB" ? 0 : r2 === "BT" ? 2 : r2 === "LR" ? 3 : 1;
}
function _3(r2) {
  return r2 + 2 & 3;
}
function me(r2, p4, B4, X2) {
  let m5 = r2.length, h7 = /* @__PURE__ */ new Map(), L5 = [], I5 = (e2, n2) => {
    let t = { id: e2, dir: n2, items: [], edges: [], ports: [], portOf: /* @__PURE__ */ new Map(), routes: /* @__PURE__ */ new Map(), x: 0, y: 0 };
    return h7.set(e2, t), t;
  }, N4 = I5(-1, B4), E6 = [];
  for (let e2 = 0; e2 < m5; e2++) E6.push([]);
  let j4 = [];
  for (let e2 = 0; e2 < m5; e2++) {
    let n2 = r2[e2].parent;
    n2 >= 0 && n2 < m5 && n2 !== e2 && r2[n2].isGroup ? E6[n2].push(e2) : (r2[e2].parent = -1, j4.push(e2));
  }
  N4.items = j4, L5.push(N4);
  let w5 = new Int32Array(m5), H4 = new Uint8Array(m5), J2 = (e2) => {
    for (let n2 = e2; n2 < L5.length; n2++) {
      let t = L5[n2];
      for (let o3 of t.items) if (H4[o3] = 1, w5[o3] = t.id < 0 ? 0 : w5[t.id] + 1, r2[o3].isGroup) {
        let c3 = I5(o3, r2[o3].dir ?? t.dir);
        c3.items = E6[o3], L5.push(c3);
      }
    }
  };
  J2(0);
  for (let e2 = 0; e2 < m5; e2++) {
    if (H4[e2]) continue;
    let n2 = r2[e2].parent;
    if (E6[n2] = E6[n2].filter((t) => t !== e2), r2[e2].parent = -1, N4.items.push(e2), H4[e2] = 1, w5[e2] = 0, r2[e2].isGroup) {
      let t = L5.length, o3 = I5(e2, r2[e2].dir ?? B4);
      o3.items = E6[e2], L5.push(o3), J2(t);
    }
  }
  for (let e2 = L5.length - 1; e2 > 0; e2--) {
    let n2 = L5[e2], t = 1 / 0;
    for (let o3 of n2.items) r2[o3].seq < t && (t = r2[o3].seq);
    t !== 1 / 0 && (r2[n2.id].seq = t);
  }
  for (let e2 of L5) e2.items.sort((n2, t) => r2[n2].seq - r2[t].seq || n2 - t);
  let Q2 = 0;
  for (let e2 of p4) {
    let n2 = e2.src, t = e2.dst, o3 = 0;
    for (; w5[n2] > w5[t]; o3++) n2 = r2[n2].parent;
    for (; w5[t] > w5[n2]; o3++) t = r2[t].parent;
    for (; n2 !== t && r2[n2].parent !== r2[t].parent; o3 += 2) n2 = r2[n2].parent, t = r2[t].parent;
    n2 !== t && (Q2 + o3 > ce ? (e2.src = n2, e2.dst = t) : Q2 += o3);
  }
  let V3 = [], Z4 = [];
  for (let e2 = 0; e2 < p4.length; e2++) {
    let n2 = p4[e2];
    if (n2.route = [], n2.src === n2.dst) {
      V3.push(e2);
      continue;
    }
    let t = n2.src, o3 = n2.dst, c3 = [], s3 = [];
    for (; w5[t] > w5[o3]; ) c3.push(t), t = r2[t].parent;
    for (; w5[o3] > w5[t]; ) s3.push(o3), o3 = r2[o3].parent;
    if (t === o3) {
      Z4.push(e2);
      continue;
    }
    for (; r2[t].parent !== r2[o3].parent; ) c3.push(t), s3.push(o3), t = r2[t].parent, o3 = r2[o3].parent;
    h7.get(r2[t].parent).edges.push({ e: e2, a: t, b: o3 });
    for (let [l4, g5] of [[c3, true], [s3, false]]) for (let x5 of l4) {
      let i5 = h7.get(r2[x5].parent), b4 = { e: e2, inner: x5, out: g5, side: 0, px: 0, py: 0, route: [] };
      i5.ports.push(b4), i5.portOf.set(e2 * 2 + (g5 ? 0 : 1), b4);
    }
  }
  let S5 = new Int32Array(m5), D4 = (e2, n2, t) => (t ? n2.src : n2.dst) !== e2, $4 = (e2, n2) => {
    let t = e2.dir === "TB" || e2.dir === "BT", o3 = se2(e2.dir), c3 = [], s3 = [];
    e2.items.forEach((i5, b4) => {
      S5[i5] = b4;
      let a2 = r2[i5], y6 = n2 ? gn(t ? a2.w : a2.h, t ? a2.h : a2.w) : gn(0, 0);
      y6.span = a2.isGroup ? Math.min(a2.span, y6.w - 2 * a2.padX) : a2.span, c3.push(y6);
    });
    let l4 = (i5, b4, a2) => r2[i5].isGroup && D4(i5, p4[b4], a2), g5 = (i5, b4, a2) => {
      if (!n2 || !r2[i5].isGroup || !D4(i5, p4[b4], a2)) return 0;
      let y6 = h7.get(i5).portOf.get(b4 * 2 + (a2 ? 0 : 1));
      return t ? y6.px - r2[i5].w / 2 : y6.py - r2[i5].h / 2;
    };
    for (let i5 of e2.edges) {
      let b4 = p4[i5.e], a2 = En(S5[i5.a], S5[i5.b], b4.minlen);
      n2 && (a2.labelW = t ? b4.labelW : b4.labelH, a2.labelH = t ? b4.labelH : b4.labelW, a2.tailDx = g5(i5.a, i5.e, true), a2.headDx = g5(i5.b, i5.e, false), a2.tailFixed = l4(i5.a, i5.e, true), a2.headFixed = l4(i5.b, i5.e, false)), s3.push(a2);
    }
    let x5 = new Int32Array(e2.ports.length).fill(-1);
    return e2.ports.forEach((i5, b4) => {
      if (i5.side === o3 || i5.side === _3(o3)) {
        let a2 = c3.length;
        c3.push(gn(0, 0, i5.side === o3 ? 3 : 4)), x5[b4] = a2;
        let y6 = i5.out ? En(S5[i5.inner], a2) : En(a2, S5[i5.inner]);
        i5.out ? (y6.tailDx = g5(i5.inner, i5.e, true), y6.tailFixed = l4(i5.inner, i5.e, true)) : (y6.headDx = g5(i5.inner, i5.e, false), y6.headFixed = l4(i5.inner, i5.e, false)), s3.push(y6);
      } else c3[S5[i5.inner]].pin = i5.side === 0 || i5.side === 3 ? -1 : 1;
    }), { lnodes: c3, ledges: s3, dummies: x5 };
  };
  for (let e2 of L5) {
    for (let s3 of e2.ports) r2[s3.inner].isGroup && D4(s3.inner, p4[s3.e], s3.out) && (h7.get(s3.inner).portOf.get(s3.e * 2 + (s3.out ? 0 : 1)).side = s3.side);
    if (e2.edges.length === 0) continue;
    let n2 = false;
    for (let s3 of e2.edges) {
      let l4 = p4[s3.e];
      (r2[s3.a].isGroup && l4.src !== s3.a || r2[s3.b].isGroup && l4.dst !== s3.b) && (n2 = true);
    }
    if (!n2) continue;
    let { lnodes: t, ledges: o3 } = $4(e2, false);
    on(t, o3), sn(t, o3, 1);
    let c3 = se2(e2.dir);
    e2.edges.forEach((s3, l4) => {
      let g5 = p4[s3.e], x5 = !o3[l4].reversed;
      r2[s3.a].isGroup && g5.src !== s3.a && (h7.get(s3.a).portOf.get(s3.e * 2).side = x5 ? _3(c3) : c3), r2[s3.b].isGroup && g5.dst !== s3.b && (h7.get(s3.b).portOf.get(s3.e * 2 + 1).side = x5 ? c3 : _3(c3));
    });
  }
  let z4 = { width: 0, height: 0 };
  for (let e2 = L5.length - 1; e2 >= 0; e2--) {
    let n2 = L5[e2], t = n2.id >= 0 ? r2[n2.id] : void 0, o3 = n2.dir === "TB" || n2.dir === "BT", c3 = n2.dir === "BT" || n2.dir === "RL", { lnodes: s3, ledges: l4, dummies: g5 } = $4(n2, true), x5 = In(s3, l4, X2), i5 = o3 ? x5.width : x5.height, b4 = o3 ? x5.height : x5.width, a2 = t ? t.padX : 0, y6 = t ? t.padTop : 0, O5 = Math.max(i5 + 2 * a2, t ? t.minW : 0), M6 = b4 + y6 + (t ? t.padBottom : 0), ie2 = (O5 - i5) / 2, ue2 = y6, F3 = (u2, d4) => ie2 + (o3 ? u2 : c3 ? x5.height - d4 : d4), K3 = (u2, d4) => ue2 + (o3 ? c3 ? x5.height - d4 : d4 : u2), U4 = o3 ? 0 : 1, ee = (u2) => {
      let d4 = [];
      for (let f3 = 0; f3 < u2.length; f3 += 2) d4.push(F3(u2[f3], u2[f3 + 1]), K3(u2[f3], u2[f3 + 1]), U4);
      return d4;
    };
    n2.items.forEach((u2, d4) => {
      r2[u2].x = F3(s3[d4].x, s3[d4].y), r2[u2].y = K3(s3[d4].x, s3[d4].y);
    }), n2.edges.forEach((u2, d4) => {
      let f3 = l4[d4];
      n2.routes.set(u2.e, ee(f3.points));
      let v4 = p4[u2.e];
      v4.labelW > 0 && (v4.labelX = F3(f3.labelX, f3.labelY), v4.labelY = K3(f3.labelX, f3.labelY));
    });
    let le = n2.edges.length;
    n2.ports.forEach((u2, d4) => {
      let f3 = r2[u2.inner];
      if (g5[d4] >= 0) {
        let T5 = ee(l4[le++].points), te = u2.out ? T5.length - 3 : 0, q5 = T5[te], C6 = T5[te + 1];
        u2.side === 0 ? C6 = 0 : u2.side === 2 ? C6 = M6 : u2.side === 3 ? q5 = 0 : q5 = O5, u2.out ? T5.push(q5, C6, U4) : T5.unshift(q5, C6, U4), u2.px = q5, u2.py = C6, u2.route = T5;
        return;
      }
      let v4 = f3.x, G3 = f3.y;
      if (f3.isGroup && D4(u2.inner, p4[u2.e], u2.out)) {
        let T5 = h7.get(u2.inner).portOf.get(u2.e * 2 + (u2.out ? 0 : 1));
        v4 += T5.px - f3.w / 2, G3 += T5.py - f3.h / 2;
      } else u2.side === 0 ? G3 -= f3.h / 2 : u2.side === 2 ? G3 += f3.h / 2 : u2.side === 3 ? v4 -= f3.w / 2 : v4 += f3.w / 2;
      let R5 = v4, W3 = G3;
      u2.side === 0 ? W3 = 0 : u2.side === 2 ? W3 = M6 : u2.side === 3 ? R5 = 0 : R5 = O5;
      let P4 = u2.side === 0 || u2.side === 2 ? 0 : 1;
      u2.px = R5, u2.py = W3, u2.route = u2.out ? [v4, G3, P4, R5, W3, P4] : [R5, W3, P4, v4, G3, P4];
    }), t ? (t.w = O5, t.h = M6) : z4 = { width: O5, height: M6 };
  }
  for (let e2 of L5) {
    let n2 = e2.x, t = e2.y;
    for (let o3 of e2.items) {
      let c3 = r2[o3];
      if (c3.x += n2, c3.y += t, c3.isGroup) {
        let s3 = h7.get(o3);
        s3.x = c3.x - c3.w / 2, s3.y = c3.y - c3.h / 2;
      }
    }
  }
  let k4 = (e2, n2, t, o3) => {
    for (let c3 = 0; c3 < n2.length; c3 += 3) {
      let s3 = n2[c3] + t, l4 = n2[c3 + 1] + o3, g5 = e2.length;
      g5 >= 3 && Math.abs(e2[g5 - 3] - s3) < 0.01 && Math.abs(e2[g5 - 2] - l4) < 0.01 || e2.push(s3, l4, n2[c3 + 2]);
    }
  };
  for (let e2 of L5) for (let n2 of e2.edges) {
    let t = p4[n2.e], o3 = [], c3 = [];
    for (let l4 = t.src; r2[l4].parent !== e2.id; l4 = r2[l4].parent) c3.push(h7.get(r2[l4].parent));
    for (let l4 of c3) k4(o3, l4.portOf.get(n2.e * 2).route, l4.x, l4.y);
    k4(o3, e2.routes.get(n2.e), e2.x, e2.y);
    let s3 = [];
    for (let l4 = t.dst; r2[l4].parent !== e2.id; l4 = r2[l4].parent) s3.push(h7.get(r2[l4].parent));
    for (let l4 = s3.length - 1; l4 >= 0; l4--) k4(o3, s3[l4].portOf.get(n2.e * 2 + 1).route, s3[l4].x, s3[l4].y);
    t.route = o3, t.labelW > 0 && (t.labelX += e2.x, t.labelY += e2.y);
  }
  for (let e2 of Z4) {
    let n2 = p4[e2], t = r2[n2.src], o3 = r2[n2.dst];
    n2.route = [t.x, t.y, 0, o3.x, o3.y, 0], n2.labelX = (t.x + o3.x) / 2, n2.labelY = (t.y + o3.y) / 2;
  }
  for (let e2 of V3) {
    let n2 = p4[e2], t = r2[n2.src];
    n2.labelX = t.x + t.w / 2 + 28 + n2.labelW / 2, n2.labelY = t.y;
  }
  return z4;
}

// node_modules/pele/dist/esm/chunks/ENHYH22O.js
var s = "about:blank";
var _4 = /^([^\w]*)(javascript|data|vbscript)/im;
var m2 = /&#(\w+)(^\w|;)?/g;
var p = /&(newline|tab);/gi;
var d3 = /[\u0000-\u001F\u007F-\u009F -‍﻿]/gim;
var C5 = /^.+(:|&colon;)/gim;
var g3 = /(\\|%5[cC])((%(6[eE]|72|74))|[nrt])/g;
function E4(e2) {
  try {
    return decodeURIComponent(e2);
  } catch {
    return e2;
  }
}
function L4(e2) {
  if (!e2) return s;
  let t = E4(e2.trim()), r2, a2 = 0;
  do {
    if (++a2 > 32) return s;
    t = t.replace(d3, "").replace(m2, (i5, R5) => String.fromCharCode(R5)).replace(p, "").replace(d3, "").replace(g3, "").trim(), t = E4(t), r2 = t.match(d3) || t.match(m2) || t.match(p) || t.match(g3);
  } while (r2 && r2.length > 0);
  if (!t) return s;
  if (t[0] === "." || t[0] === "/") return t;
  let o3 = t.trimStart(), c3 = o3.match(C5);
  if (!c3) return t;
  let n2 = c3[0].toLowerCase().trim();
  if (_4.test(n2)) return s;
  let l4 = o3.replace(/\\/g, "/");
  if (n2 === "mailto:" || n2.includes("://")) return l4;
  if (n2 === "http:" || n2 === "https:") {
    let i5;
    try {
      i5 = new URL(l4);
    } catch {
      return s;
    }
    return i5.protocol = i5.protocol.toLowerCase(), i5.hostname = i5.hostname.toLowerCase(), i5.toString();
  }
  return l4;
}
function A4(e2) {
  return L4($2(e2));
}
var S3 = ["http", "https", "mailto", "tel"];
var w3 = ["http", "https"];
var T4 = /^([a-z][a-z0-9+.-]*):/i;
var I3 = /^[\\/]{2}/;
function h4(e2, t) {
  if (I3.test(e2)) return;
  let r2 = T4.exec(e2);
  return !r2 || t.includes(r2[1].toLowerCase()) ? e2 : void 0;
}
function M4(e2, t) {
  return t.links === false ? void 0 : h4(e2, t.linkSchemes ?? S3);
}
function H2(e2, t) {
  return t.images === false ? void 0 : h4(e2, t.imageSchemes ?? w3);
}
function N3(e2, t, r2, a2, o3, c3 = "") {
  let n2 = M4(t, o3);
  return n2 === void 0 ? e2 : (a2.push({ id: r2, href: n2, internal: false }), `<a href="${$3(n2)}"${c3}${O3(o3)}>${e2}</a>`);
}
function O3(e2) {
  let t = e2.linkRel ?? "noopener";
  return t ? ` rel="${$3(t)}"` : "";
}

// node_modules/pele/dist/esm/chunks/4X3DD7WN.js
var o2 = 18;
var i4 = 12;
var f2 = 12;
var p2 = (n2, t, e2) => (e2 ? t : n2) - 2 * f2;
var z3 = (n2) => (t, e2, s3) => s3 ? 0 : t - 2 * n2(e2) - 2 * f2;
function H3(n2, t, e2) {
  let s3 = Math.min(1, Math.abs(n2) / t);
  return e2 * (1 - Math.sqrt(1 - s3 * s3));
}
var m3 = (n2, t, e2, s3) => e2 & 1 ? H3(s3, t / 2, n2 / 2) : H3(s3, n2 / 2, t / 2);
var y5 = (n2, t, e2) => (e2 ? t : n2) * 0.6;
var q4 = (n2, t, e2, s3) => e2 & 1 ? 0 : H3(s3, n2 / 2, Math.min(12, Math.max(6, n2 / 14)));
var h5 = (n2, t) => () => ({ w: n2, h: t, dy: 0 });
function I4(n2, t, e2) {
  let s3 = Math.max(1.6 * n2 + 40, 80), $4 = (t + 10) / (1 - (n2 + 8) / s3), a2 = $4 / 2 - 10 - t / 2;
  return { w: s3, h: $4, dy: e2 ? -a2 : a2 };
}
function M5(n2, t) {
  return `<path d="${n2}"${t}/>`;
}
var w4 = (n2, t, e2) => e2 & 1 ? t / 8 : 0;
var x4 = (n2, t) => ({ w: Math.max(n2 + 2 * o2, 2 * o2 + 12), h: t + 2 * i4, dy: 0 });
function l3(n2, t) {
  let e2 = "";
  for (let s3 = 0; s3 < n2.length; s3 += 2) e2 += (s3 ? " " : "") + m(n2[s3]) + "," + m(n2[s3 + 1]);
  return `<polygon points="${e2}"${t}/>`;
}
function u(n2, t, e2, s3 = "") {
  return `<rect x="${m(-n2 / 2)}" y="${m(-t / 2)}" width="${m(n2)}" height="${m(t)}"${s3}${e2}/>`;
}
var b3 = ` rx="${E3}"`;
var Z3 = { rect: { size: x4, span: p2, draw: (n2, t, e2) => u(n2, t, e2, b3) }, rounded: { size: x4, span: p2, draw: (n2, t, e2) => u(n2, t, e2, ` rx="${m(Math.min(12, t / 2))}"`) }, stadium: { inset: (n2, t, e2, s3) => e2 & 1 ? H3(s3, t / 2, t / 2) : 0, span: (n2, t, e2) => e2 ? t * 0.6 : n2 - t, size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + e2 * 0.5 + 2 * o2 - 8, h: e2, dy: 0 };
}, draw: (n2, t, e2) => u(n2, t, e2, ` rx="${m(t / 2)}"`) }, "fr-rect": { span: p2, size: (n2, t) => ({ w: n2 + 2 * o2 + 16, h: t + 2 * i4, dy: 0 }), draw: (n2, t, e2, s3) => {
  let $4 = n2 / 2 - 8;
  return u(n2, t, e2, b3) + `<path d="M${m(-$4)},${m(-t / 2)}V${m(t / 2)}M${m($4)},${m(-t / 2)}V${m(t / 2)}" fill="none"${s3}/>`;
} }, cyl: { inset: q4, span: (n2, t, e2) => e2 ? t - 2 * f2 - 12 : n2 * 0.6, size: (n2, t) => {
  let e2 = Math.max(n2 + 2 * o2, 56), s3 = Math.min(12, Math.max(6, e2 / 14));
  return { w: e2, h: t + 2 * i4 + 2 * s3, dy: s3 / 2 };
}, draw: (n2, t, e2, s3) => {
  let $4 = n2 / 2, a2 = Math.min(12, Math.max(6, n2 / 14)), c3 = -t / 2 + a2, d4 = t / 2 - a2;
  return `<path d="M${m(-$4)},${m(c3)}A${m($4)},${m(a2)} 0 0 1 ${m($4)},${m(c3)}V${m(d4)}A${m($4)},${m(a2)} 0 0 1 ${m(-$4)},${m(d4)}Z"${e2}/><path d="M${m(-$4)},${m(c3)}A${m($4)},${m(a2)} 0 0 0 ${m($4)},${m(c3)}" fill="none"${s3}/>`;
} }, circle: { inset: m3, span: y5, size: (n2, t) => {
  let e2 = Math.max(Math.sqrt(n2 * n2 + t * t) + 16, 44);
  return { w: e2, h: e2, dy: 0 };
}, draw: (n2, t, e2) => `<circle r="${m(n2 / 2)}"${e2}/>` }, "dbl-circ": { inset: m3, span: y5, size: (n2, t) => {
  let e2 = Math.max(Math.sqrt(n2 * n2 + t * t) + 26, 54);
  return { w: e2, h: e2, dy: 0 };
}, draw: (n2, t, e2, s3) => `<circle r="${m(n2 / 2)}"${e2}/><circle r="${m(n2 / 2 - 5)}" fill="none"${s3}/>` }, ellipse: { inset: m3, span: y5, size: (n2, t) => ({ w: n2 * 1.3 + 2 * o2, h: t * 1.2 + 2 * i4, dy: 0 }), draw: (n2, t, e2) => `<ellipse rx="${m(n2 / 2)}" ry="${m(t / 2)}"${e2}/>` }, diam: { inset: (n2, t, e2, s3) => e2 & 1 ? Math.abs(s3) * n2 / t : Math.abs(s3) * t / n2, span: (n2, t, e2) => (e2 ? t : n2) * 0.6, size: (n2, t) => {
  let e2 = n2 + 16, s3 = t + 8;
  return { w: e2 + 1.6 * s3, h: e2 / 1.6 + s3, dy: 0 };
}, draw: (n2, t, e2) => l3([0, -t / 2, n2 / 2, 0, 0, t / 2, -n2 / 2, 0], e2) }, hex: { inset: (n2, t, e2, s3) => e2 & 1 ? Math.abs(s3) / 2 : 0, span: (n2, t, e2) => e2 ? t * 0.5 : n2 - t / 2 - f2, size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 / 2, h: e2, dy: 0 };
}, draw: (n2, t, e2) => {
  let s3 = t / 4;
  return l3([-n2 / 2 + s3, -t / 2, n2 / 2 - s3, -t / 2, n2 / 2, 0, n2 / 2 - s3, t / 2, -n2 / 2 + s3, t / 2, -n2 / 2, 0], e2);
} }, odd: { inset: (n2, t, e2) => e2 === 3 ? t / 4 : 0, span: z3(() => 0), size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 / 4, h: e2, dy: 0 };
}, draw: (n2, t, e2) => {
  let s3 = t / 4;
  return l3([-n2 / 2, -t / 2, n2 / 2, -t / 2, n2 / 2, t / 2, -n2 / 2, t / 2, -n2 / 2 + s3, 0], e2);
} }, "lean-r": { inset: w4, span: z3((n2) => n2 / 4), size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 / 2, h: e2, dy: 0 };
}, draw: (n2, t, e2) => {
  let s3 = t / 4;
  return l3([-n2 / 2 + s3, -t / 2, n2 / 2, -t / 2, n2 / 2 - s3, t / 2, -n2 / 2, t / 2], e2);
} }, "lean-l": { inset: w4, span: z3((n2) => n2 / 4), size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 / 2, h: e2, dy: 0 };
}, draw: (n2, t, e2) => {
  let s3 = t / 4;
  return l3([-n2 / 2, -t / 2, n2 / 2 - s3, -t / 2, n2 / 2, t / 2, -n2 / 2 + s3, t / 2], e2);
} }, "trap-b": { inset: w4, span: z3((n2) => n2 / 4), size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 / 2, h: e2, dy: 0 };
}, draw: (n2, t, e2) => {
  let s3 = t / 4;
  return l3([-n2 / 2 + s3, -t / 2, n2 / 2 - s3, -t / 2, n2 / 2, t / 2, -n2 / 2, t / 2], e2);
} }, "trap-t": { inset: w4, span: z3((n2) => n2 / 4), size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 / 2, h: e2, dy: 0 };
}, draw: (n2, t, e2) => {
  let s3 = t / 4;
  return l3([-n2 / 2, -t / 2, n2 / 2, -t / 2, n2 / 2 - s3, t / 2, -n2 / 2 + s3, t / 2], e2);
} }, text: { span: p2, size: (n2, t) => ({ w: n2 + 8, h: t + 8, dy: 0 }), draw: (n2, t) => u(n2, t, ' fill="none" stroke="none"') }, "sm-circ": { noLabel: true, inset: m3, span: y5, size: h5(14, 14), draw: (n2, t, e2) => `<circle r="${m(n2 / 2)}"${e2}/>` }, "f-circ": { noLabel: true, inset: m3, span: y5, size: h5(14, 14), draw: (n2, t, e2, s3) => `<circle r="${m(n2 / 2)}" fill="var(--_l)"${s3}/>` }, "fr-circ": { noLabel: true, inset: m3, span: y5, size: h5(18, 18), draw: (n2, t, e2, s3) => `<circle r="${m(n2 / 2)}"${e2}/><circle r="${m(n2 / 2 - 4)}" fill="var(--_l)"${s3}/>` }, fork: { noLabel: true, span: (n2, t, e2) => (e2 ? t : n2) - 8, size: h5(72, 8), draw: (n2, t, e2, s3) => u(n2, t, ` fill="var(--_l)"${s3}`, ' rx="2"') }, "notch-rect": { size: x4, span: p2, draw: (n2, t, e2) => l3([-n2 / 2 + 10, -t / 2, n2 / 2, -t / 2, n2 / 2, t / 2, -n2 / 2, t / 2, -n2 / 2, -t / 2 + 10], e2) }, "lin-rect": { span: p2, size: (n2, t) => ({ w: n2 + 2 * o2 + 8, h: t + 2 * i4, dy: 0 }), draw: (n2, t, e2, s3) => u(n2, t, e2, b3) + `<path d="M${m(-n2 / 2 + 8)},${m(-t / 2)}V${m(t / 2)}" fill="none"${s3}/>` }, "div-rect": { span: p2, size: (n2, t) => ({ w: n2 + 2 * o2, h: t + 2 * i4 + 8, dy: 4 }), draw: (n2, t, e2, s3) => u(n2, t, e2, b3) + `<path d="M${m(-n2 / 2)},${m(-t / 2 + 8)}H${m(n2 / 2)}" fill="none"${s3}/>` }, "win-pane": { span: p2, size: (n2, t) => ({ w: n2 + 2 * o2 + 8, h: t + 2 * i4 + 8, dy: 4 }), draw: (n2, t, e2, s3) => u(n2, t, e2, b3) + `<path d="M${m(-n2 / 2 + 8)},${m(-t / 2)}V${m(t / 2)}M${m(-n2 / 2)},${m(-t / 2 + 8)}H${m(n2 / 2)}" fill="none"${s3}/>` }, tri: { inset: (n2, t, e2) => e2 & 1 ? n2 / 4 : 0, size: (n2, t) => I4(n2, t, false), draw: (n2, t, e2) => l3([0, -t / 2, n2 / 2, t / 2, -n2 / 2, t / 2], e2) }, "flip-tri": { inset: (n2, t, e2) => e2 & 1 ? n2 / 4 : 0, size: (n2, t) => I4(n2, t, true), draw: (n2, t, e2) => l3([-n2 / 2, -t / 2, n2 / 2, -t / 2, 0, t / 2], e2) }, "sl-rect": { inset: (n2, t, e2) => e2 === 0 ? 5 : 0, size: (n2, t) => ({ w: n2 + 2 * o2, h: t + 2 * i4 + 10, dy: 5 }), draw: (n2, t, e2) => l3([-n2 / 2, -t / 2 + 10, n2 / 2, -t / 2, n2 / 2, t / 2, -n2 / 2, t / 2], e2) }, "notch-pent": { span: p2, size: (n2, t) => ({ w: n2 + 2 * o2, h: t + 2 * i4, dy: 0 }), draw: (n2, t, e2) => l3([-n2 / 2 + 10, -t / 2, n2 / 2 - 10, -t / 2, n2 / 2, -t / 2 + 10, n2 / 2, t / 2, -n2 / 2, t / 2, -n2 / 2, -t / 2 + 10], e2) }, hourglass: { noLabel: true, inset: (n2, t, e2) => e2 & 1 ? n2 / 2 : 0, size: h5(32, 40), draw: (n2, t, e2) => l3([-n2 / 2, -t / 2, n2 / 2, -t / 2, -n2 / 2, t / 2, n2 / 2, t / 2], e2) }, delay: { size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 / 4, h: e2, dy: 0 };
}, draw: (n2, t, e2) => {
  let s3 = t / 2;
  return `<path d="M${m(-n2 / 2)},${m(-s3)}H${m(n2 / 2 - s3)}A${m(s3)},${m(s3)} 0 0 1 ${m(n2 / 2 - s3)},${m(s3)}H${m(-n2 / 2)}Z"${e2}/>`;
} }, "h-cyl": { size: (n2, t) => {
  let e2 = t + 2 * i4, s3 = Math.min(12, e2 / 4);
  return { w: n2 + 2 * o2 + 2 * s3, h: e2, dy: 0 };
}, draw: (n2, t, e2, s3) => {
  let $4 = t / 2, a2 = Math.min(12, t / 4), c3 = -n2 / 2 + a2, d4 = n2 / 2 - a2;
  return `<path d="M${m(c3)},${m(-$4)}H${m(d4)}A${m(a2)},${m($4)} 0 0 1 ${m(d4)},${m($4)}H${m(c3)}A${m(a2)},${m($4)} 0 0 1 ${m(c3)},${m(-$4)}Z"${e2}/><path d="M${m(d4)},${m(-$4)}A${m(a2)},${m($4)} 0 0 0 ${m(d4)},${m($4)}" fill="none"${s3}/>`;
} }, "cross-circ": { noLabel: true, inset: m3, span: y5, size: h5(44, 44), draw: (n2, t, e2, s3) => {
  let $4 = n2 / 2, a2 = $4 * Math.SQRT1_2;
  return `<circle r="${m($4)}"${e2}/><path d="M${m(-a2)},${m(-a2)}L${m(a2)},${m(a2)}M${m(a2)},${m(-a2)}L${m(-a2)},${m(a2)}" fill="none"${s3}/>`;
} }, "st-rect": { span: (n2, t, e2) => (e2 ? t : n2) - 2 * f2 - 8, size: (n2, t) => ({ w: n2 + 2 * o2 + 8, h: t + 2 * i4 + 8, dy: 4 }), draw: (n2, t, e2) => {
  let s3 = n2 - 8, $4 = t - 8, a2 = "";
  for (let c3 = 0; c3 < 3; c3++) {
    let d4 = -n2 / 2 + (2 - c3) * 4, _5 = -t / 2 + c3 * 4;
    a2 += `<rect x="${m(d4)}" y="${m(_5)}" width="${m(s3)}" height="${m($4)}"${b3}${e2}/>`;
  }
  return a2;
} }, doc: { inset: (n2, t, e2) => e2 === 2 ? 10 : 0, size: (n2, t) => ({ w: n2 + 2 * o2, h: t + 2 * i4 + 10, dy: -5 }), draw: (n2, t, e2) => A5(n2, t, e2) }, flag: { inset: (n2, t, e2) => e2 & 1 ? 0 : 8, size: (n2, t) => ({ w: n2 + 2 * o2, h: t + 2 * i4 + 16, dy: 0 }), draw: (n2, t, e2) => {
  let s3 = n2 / 2, $4 = t / 2 - 8, a2 = n2 / 4;
  return `<path d="M${m(-s3)},${m(-$4)}q${m(a2)},-10 ${m(2 * a2)},0t${m(2 * a2)},0V${m($4)}q${m(-a2)},10 ${m(-2 * a2)},0t${m(-2 * a2)},0Z"${e2}/>`;
} }, datastore: { size: x4, span: p2, draw: (n2, t, e2, s3) => u(n2, t, e2.replace('stroke="var(--_b)"', 'stroke="none"')) + `<path d="M${m(-n2 / 2)},${m(-t / 2)}H${m(n2 / 2)}M${m(-n2 / 2)},${m(t / 2)}H${m(n2 / 2)}" fill="none"${s3}/>` }, folder: { size: (n2, t) => ({ w: Math.max(n2 + 2 * o2, 64), h: t + 2 * i4 + 8, dy: 4 }), draw: (n2, t, e2) => {
  let s3 = n2 / 2, $4 = t / 2, a2 = Math.min(n2 * 0.4, 48);
  return M5(`M${m(-s3)},${m(-$4)}H${m(-s3 + a2)}L${m(-s3 + a2 + 8)},${m(-$4 + 8)}H${m(s3)}V${m($4)}H${m(-s3)}Z`, e2);
} }, bucket: { size: (n2, t) => ({ w: n2 + 2 * o2 + 20, h: t + 2 * i4 + 10, dy: 3 }), inset: (n2, t, e2) => e2 & 1 ? t / 12 : 0, draw: (n2, t, e2, s3) => {
  let $4 = n2 / 2, a2 = t / 2, c3 = 5, d4 = t / 6;
  return M5(`M${m(-$4)},${m(-a2 + c3)}A${m($4)},${m(c3)} 0 0 1 ${m($4)},${m(-a2 + c3)}L${m($4 - d4)},${m(a2 - c3)}A${m($4 - d4)},${m(c3)} 0 0 1 ${m(-$4 + d4)},${m(a2 - c3)}Z`, e2) + `<path d="M${m(-$4)},${m(-a2 + c3)}A${m($4)},${m(c3)} 0 0 0 ${m($4)},${m(-a2 + c3)}" fill="none"${s3}/>`;
} }, console: { span: p2, size: (n2, t) => ({ w: Math.max(n2 + 2 * o2, 72), h: t + 2 * i4 + 12, dy: 6 }), draw: (n2, t, e2, s3) => u(n2, t, e2, b3) + `<path d="M${m(-n2 / 2)},${m(-t / 2 + 12)}H${m(n2 / 2)}M${m(-n2 / 2 + 7)},${m(-t / 2 + 4)}l3,2.5l-3,2.5M${m(-n2 / 2 + 13)},${m(-t / 2 + 9)}h4" fill="none"${s3}/>` }, browser: { span: p2, size: (n2, t) => ({ w: Math.max(n2 + 2 * o2, 72), h: t + 2 * i4 + 12, dy: 6 }), draw: (n2, t, e2, s3) => {
  let $4 = "";
  for (let a2 = 0; a2 < 3; a2++) $4 += `<circle cx="${m(-n2 / 2 + 8 + a2 * 7)}" cy="${m(-t / 2 + 6)}" r="1.5" fill="none"${s3}/>`;
  return u(n2, t, e2, b3) + `<path d="M${m(-n2 / 2)},${m(-t / 2 + 12)}H${m(n2 / 2)}" fill="none"${s3}/>` + $4;
} }, person: { size: (n2, t) => ({ w: Math.max(n2 + 2 * o2, 56), h: t + 2 * i4 + 26, dy: 13 }), draw: (n2, t, e2) => {
  let s3 = -t / 2;
  return `<rect x="${m(-n2 / 2)}" y="${m(s3 + 26)}" width="${m(n2)}" height="${m(t - 26)}" rx="12"${e2}/><circle cy="${m(s3 + 14)}" r="13"${e2}/>`;
} }, bang: { size: (n2, t) => ({ w: n2 + 2 * o2 + 28, h: t + 2 * i4 + 24, dy: 0 }), inset: () => 3, draw: (n2, t, e2) => {
  let $4 = [];
  for (let a2 = 0; a2 < 28; a2++) {
    let c3 = Math.PI * a2 / 14 - Math.PI / 2, d4 = a2 % 2 === 0 ? 1 : 0.82;
    $4.push(Math.cos(c3) * (n2 / 2) * d4, Math.sin(c3) * (t / 2) * d4);
  }
  return l3($4, e2);
} }, cloud: { size: (n2, t) => ({ w: n2 + 2 * o2 + 32, h: t + 2 * i4 + 24, dy: 0 }), inset: (n2, t, e2) => e2 & 1 ? 2 : 1, draw: (n2, t, e2) => {
  let s3 = n2 / 2, $4 = t / 2, a2 = $4 * 0.55;
  return M5(`M${m(-s3 + a2)},${m($4)}A${m(a2)},${m(a2)} 0 0 1 ${m(-s3 + a2 * 0.6)},${m(-$4 * 0.1)}A${m(s3 * 0.42)},${m($4 * 0.7)} 0 0 1 ${m(-s3 * 0.1)},${m(-$4 * 0.72)}A${m(s3 * 0.4)},${m($4 * 0.62)} 0 0 1 ${m(s3 * 0.62)},${m(-$4 * 0.42)}A${m(a2 * 1.05)},${m(a2 * 1.05)} 0 0 1 ${m(s3 - a2)},${m($4)}Z`, e2);
} }, brace: { size: (n2, t) => ({ w: n2 + 2 * o2 + 12, h: t + 2 * i4, dy: 0 }), draw: (n2, t, e2, s3) => u(n2, t, ' fill="none" stroke="none"') + S4(-n2 / 2 + 12, t, -1, s3) }, "brace-r": { size: (n2, t) => ({ w: n2 + 2 * o2 + 12, h: t + 2 * i4, dy: 0 }), draw: (n2, t, e2, s3) => u(n2, t, ' fill="none" stroke="none"') + S4(n2 / 2 - 12, t, 1, s3) }, braces: { size: (n2, t) => ({ w: n2 + 2 * o2 + 24, h: t + 2 * i4, dy: 0 }), draw: (n2, t, e2, s3) => u(n2, t, ' fill="none" stroke="none"') + S4(-n2 / 2 + 12, t, -1, s3) + S4(n2 / 2 - 12, t, 1, s3) }, bolt: { noLabel: true, size: h5(36, 56), inset: (n2, t, e2) => e2 & 1 ? n2 / 4 : 0, draw: (n2, t, e2) => l3([n2 * 0.15, -t / 2, -n2 / 2, t * 0.08, -n2 * 0.05, t * 0.08, -n2 * 0.15, t / 2, n2 / 2, -t * 0.08, n2 * 0.05, -t * 0.08], e2) }, "lin-cyl": { inset: q4, span: (n2, t, e2) => e2 ? t - 2 * f2 - 20 : n2 * 0.6, size: (n2, t) => {
  let e2 = Math.max(n2 + 2 * o2, 56), s3 = Math.min(12, Math.max(6, e2 / 14));
  return { w: e2, h: t + 2 * i4 + 2 * s3 + 8, dy: s3 / 2 + 4 };
}, draw: (n2, t, e2, s3) => {
  let $4 = n2 / 2, a2 = Math.min(12, Math.max(6, n2 / 14)), c3 = -t / 2 + a2, d4 = t / 2 - a2, _5 = (L5) => `M${m(-$4)},${m(L5)}A${m($4)},${m(a2)} 0 0 0 ${m($4)},${m(L5)}`;
  return M5(`M${m(-$4)},${m(c3)}A${m($4)},${m(a2)} 0 0 1 ${m($4)},${m(c3)}V${m(d4)}A${m($4)},${m(a2)} 0 0 1 ${m(-$4)},${m(d4)}Z`, e2) + `<path d="${_5(c3)}${_5(c3 + 8)}" fill="none"${s3}/>`;
} }, "curv-trap": { size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 * 0.6, h: e2, dy: 0 };
}, draw: (n2, t, e2) => {
  let s3 = n2 / 2, $4 = t / 2, a2 = t * 0.3;
  return M5(`M${m(-s3 + a2)},${m(-$4)}H${m(s3 - a2)}A${m(a2)},${m($4)} 0 0 1 ${m(s3 - a2)},${m($4)}H${m(-s3 + a2)}L${m(-s3)},0Z`, e2);
} }, docs: { size: (n2, t) => ({ w: n2 + 2 * o2 + 8, h: t + 2 * i4 + 18, dy: -1 }), inset: (n2, t, e2) => e2 === 2 ? 10 : 0, draw: (n2, t, e2) => {
  let s3 = "";
  for (let $4 = 0; $4 < 3; $4++) s3 += `<g transform="translate(${(1 - $4) * 4},${($4 - 1) * 4})">${A5(n2 - 8, t - 8, e2)}</g>`;
  return s3;
} }, "bow-rect": { size: (n2, t) => {
  let e2 = t + 2 * i4;
  return { w: n2 + 2 * o2 + e2 * 0.4, h: e2, dy: 0 };
}, inset: (n2, t, e2) => e2 === 1 ? t * 0.2 : 0, draw: (n2, t, e2) => {
  let s3 = n2 / 2, $4 = t / 2, a2 = t * 0.2;
  return M5(`M${m(-s3 + a2)},${m(-$4)}H${m(s3)}A${m(a2)},${m($4)} 0 0 0 ${m(s3)},${m($4)}H${m(-s3 + a2)}A${m(a2)},${m($4)} 0 0 1 ${m(-s3 + a2)},${m(-$4)}Z`, e2);
} }, "tag-rect": { size: x4, span: p2, draw: (n2, t, e2, s3) => u(n2, t, e2, b3) + `<path d="M${m(n2 / 2 - 12)},${m(t / 2)}L${m(n2 / 2)},${m(t / 2 - 12)}" fill="none"${s3}/>` }, "tag-doc": { size: (n2, t) => ({ w: n2 + 2 * o2, h: t + 2 * i4 + 10, dy: -5 }), inset: (n2, t, e2) => e2 === 2 ? 10 : 0, draw: (n2, t, e2, s3) => A5(n2, t, e2) + `<path d="M${m(n2 / 2 - 12)},${m(t / 2 - 14)}L${m(n2 / 2)},${m(t / 2 - 26)}" fill="none"${s3}/>` }, "lin-doc": { size: (n2, t) => ({ w: n2 + 2 * o2 + 8, h: t + 2 * i4 + 10, dy: -5 }), inset: (n2, t, e2) => e2 === 2 ? 10 : 0, draw: (n2, t, e2, s3) => A5(n2, t, e2) + `<path d="M${m(-n2 / 2 + 8)},${m(-t / 2)}V${m(t / 2 - 6)}" fill="none"${s3}/>` }, collapsedGroup: { size: (n2, t) => ({ w: n2 + 2 * o2 + 8, h: t + 2 * i4 + 8, dy: -2 }), draw: (n2, t, e2) => `<rect x="${m(-n2 / 2 + 6)}" y="${m(-t / 2 + 8)}" width="${m(n2 - 12)}" height="${m(t - 8)}"${b3}${e2}/><rect x="${m(-n2 / 2)}" y="${m(-t / 2)}" width="${m(n2)}" height="${m(t - 4)}"${b3}${e2}/>` } };
function S4(n2, t, e2, s3) {
  let $4 = t / 2, a2 = 6 * e2;
  return `<path d="M${m(n2)},${m(-$4)}q${m(a2)},0 ${m(a2)},6V-6q0,6 ${m(a2)},6q${m(-a2)},0 ${m(-a2)},6V${m($4 - 6)}q0,6 ${m(-a2)},6" fill="none"${s3}/>`;
}
function A5(n2, t, e2) {
  let s3 = n2 / 2, $4 = -t / 2, a2 = t / 2 - 10, c3 = n2 / 4;
  return `<path d="M${m(-s3)},${m($4)}H${m(s3)}V${m(a2)}q${m(-c3)},-12 ${m(-2 * c3)},0t${m(-2 * c3)},0Z"${e2}/>`;
}
var D3 = Z3.rect;
var g4 = new Map(Object.entries(Z3));
function P3(n2, t, e2) {
  return (g4.get(n2) ?? D3).size(t, e2);
}
function E5(n2, t, e2, s3, $4) {
  return (g4.get(n2) ?? D3).draw(t, e2, s3, $4);
}
function V2(n2, t, e2, s3, $4 = 0) {
  return g4.get(n2)?.inset?.(t, e2, s3, $4) ?? 0;
}
function O4(n2, t, e2, s3) {
  return Math.max(0, g4.get(n2)?.span?.(t, e2, s3) ?? 0);
}
function j3(n2) {
  return g4.get(n2)?.noLabel !== true;
}
function R4(n2, t, e2) {
  let s3 = n2[t] - e2.x, $4 = n2[t + 1] - e2.y;
  return Math.abs(Math.abs($4) - e2.h / 2) < 0.5 ? $4 < 0 ? 0 : 2 : Math.abs(Math.abs(s3) - e2.w / 2) < 0.5 ? s3 < 0 ? 3 : 1 : -1;
}
function B3(n2, t, e2, s3) {
  if (s3.isGroup) return;
  let $4 = R4(n2, t, s3);
  if ($4 === 0 || $4 === 2) {
    let a2 = V2(e2.shape, e2.w, e2.h, $4, n2[t] - s3.x) + (s3.h - e2.h) / 2;
    n2[t + 1] += $4 === 0 ? a2 : -a2;
  } else if ($4 >= 0) {
    let a2 = V2(e2.shape, e2.w, e2.h, $4, n2[t + 1] - s3.y) + (s3.w - e2.w) / 2;
    n2[t] += $4 === 3 ? a2 : -a2;
  }
}

// node_modules/pele/dist/esm/chunks/DKTLEL5E.js
function h6(t) {
  let n2 = t.maxWidth;
  return n2 !== void 0 && n2 > 0 ? Math.max(80, n2 - 2 * (t.padding ?? 8)) : 4e3;
}
var s2 = 640;
function c2(t, n2) {
  let r2 = n2(false), i5 = t.maxWidth;
  if (t.autoDirection === false || i5 === void 0 || !(i5 > 0) || r2.width <= i5) return r2;
  let e2 = t.directionBreakpoint;
  if (i5 >= (e2 !== void 0 && e2 > 0 ? e2 : s2)) return r2;
  let o3 = n2(true);
  return o3.width < r2.width ? o3 : r2;
}
function m4(t) {
  return t === "LR" || t === "RL";
}
function p3(t, n2) {
  let r2 = n2(false), i5 = t.maxWidth;
  if (i5 === void 0 || !(i5 > 0) || r2.width <= i5) return r2;
  let e2 = n2(true);
  return e2.width < r2.width ? e2 : r2;
}

// node_modules/pele/dist/esm/chunks/ZJKP2ZMR.js
function De(o3) {
  return o3 === "markdown" || o3 === "string" || o3 === "text" ? o3 : "markdown";
}
function Et(o3) {
  return o3.startsWith('"') && o3.endsWith('"') ? o3.substring(1, o3.length - 1) : o3;
}
function Ct2(o3, s3) {
  let l4 = 0;
  for (let i5 = 0; i5 < s3.length; i5++) s3[i5] === o3 && l4++;
  return l4;
}
function Dt(o3) {
  let s3 = o3.trim(), l4 = "arrow_open";
  switch (s3[0]) {
    case "<":
      l4 = "arrow_point", s3 = s3.slice(1);
      break;
    case "x":
      l4 = "arrow_cross", s3 = s3.slice(1);
      break;
    case "o":
      l4 = "arrow_circle", s3 = s3.slice(1);
      break;
  }
  let i5 = "normal";
  return s3.includes("=") && (i5 = "thick"), s3.includes(".") && (i5 = "dotted"), { type: l4, stroke: i5 };
}
function kt(o3) {
  let s3 = o3.trim(), l4 = s3.slice(0, -1), i5 = "arrow_open";
  switch (s3.slice(-1)) {
    case "x":
      i5 = "arrow_cross", s3.startsWith("x") && (i5 = "double_" + i5, l4 = l4.slice(1));
      break;
    case ">":
      i5 = "arrow_point", s3.startsWith("<") && (i5 = "double_" + i5, l4 = l4.slice(1));
      break;
    case "o":
      i5 = "arrow_circle", s3.startsWith("o") && (i5 = "double_" + i5, l4 = l4.slice(1));
      break;
  }
  let u2 = "normal", A6 = l4.length - 1;
  l4.startsWith("=") && (u2 = "thick"), l4.startsWith("~") && (u2 = "invisible");
  let n2 = Ct2(".", l4);
  return n2 && (u2 = "dotted", A6 = n2), { type: i5, stroke: u2, length: A6 };
}
var Ee = class {
  constructor(s3 = {}) {
    __publicField(this, "type", "flowchart");
    __publicField(this, "direction");
    __publicField(this, "nodes", /* @__PURE__ */ new Map());
    __publicField(this, "edges", []);
    __publicField(this, "subgraphs", []);
    __publicField(this, "classes", /* @__PURE__ */ new Map());
    __publicField(this, "tooltips", /* @__PURE__ */ new Map());
    __publicField(this, "defaultEdgeStyle");
    __publicField(this, "defaultInterpolate");
    __publicField(this, "title");
    __publicField(this, "accTitle");
    __publicField(this, "accDescr");
    __publicField(this, "subgraphLookup", /* @__PURE__ */ new Map());
    __publicField(this, "members", /* @__PURE__ */ new Set());
    __publicField(this, "edgeById", /* @__PURE__ */ new Map());
    __publicField(this, "pairCount", /* @__PURE__ */ new Map());
    __publicField(this, "subCount", 0);
    __publicField(this, "options");
    this.options = s3;
  }
  addVertex(s3, l4, i5, u2, A6, n2, e2 = {}, I5) {
    if (!s3 || s3.trim().length === 0) return;
    let h7;
    if (I5 !== void 0) {
      let N4 = I5.includes(`
`) ? I5 + `
` : `{
` + I5 + `
}`, w5;
      try {
        w5 = q(N4);
      } catch (G3) {
        throw new x2(`Metadata of "${s3}" is not valid YAML. ${G3.message}`, "syntax", { type: "flowchart" });
      }
      h7 = w5 !== null && typeof w5 == "object" && !Array.isArray(w5) ? w5 : void 0;
    }
    let D4 = this.subgraphLookup.get(s3);
    if (D4 && h7) {
      D4.metadata = { ...D4.metadata, ...h7 };
      return;
    }
    let k4 = this.edgeById.get(s3);
    if (k4) {
      h7?.animate !== void 0 && (k4.animate = h7.animate), h7?.animation !== void 0 && (k4.animation = h7.animation), h7?.curve !== void 0 && (k4.interpolate = h7.curve);
      return;
    }
    let m5 = this.nodes.get(s3);
    if (m5 === void 0 && (l4 === void 0 && i5 === void 0 && u2 !== void 0 && u2 !== null && this.options.warn?.(`Style applied to unknown node "${s3}". This may indicate a typo. The node will be created automatically.`), m5 = { id: s3, labelType: "text", styles: [], classes: [] }, this.nodes.set(s3, m5)), l4 !== void 0 ? (m5.labelType = l4.type, m5.text = Et(l4.text.trim())) : m5.text === void 0 && (m5.text = s3), i5 !== void 0 && (m5.type = i5), u2 != null) for (let N4 of u2) m5.styles.push(N4);
    if (A6 != null) for (let N4 of A6) m5.classes.push(N4);
    if (n2 !== void 0 && (m5.dir = n2), m5.props === void 0 ? m5.props = e2 : e2 !== void 0 && Object.assign(m5.props, e2), h7 === void 0) return;
    if (h7.shape) {
      let N4 = String(h7.shape);
      if (N4 !== N4.toLowerCase() || N4.includes("_")) throw new x2(`No such shape: ${N4}. Shape names should be lowercase.`, "semantic", { type: "flowchart" });
      if (!a(N4)) throw new x2(`No such shape: ${N4}.`, "semantic", { type: "flowchart" });
      m5.type = N4;
    }
    let C6 = typeof h7.label == "string" ? h7.label : void 0;
    h7.label && (m5.text = String(h7.label), m5.labelType = De(h7.labelType)), h7.icon && (m5.icon = String(h7.icon), !C6?.trim() && m5.text === s3 && (m5.text = "")), h7.form && (m5.form = String(h7.form)), h7.pos && (m5.pos = String(h7.pos)), h7.img && (m5.img = String(h7.img), !C6?.trim() && m5.text === s3 && (m5.text = "")), h7.constraint && (m5.constraint = String(h7.constraint)), h7.w && (m5.assetWidth = Number(h7.w)), h7.h && (m5.assetHeight = Number(h7.h));
  }
  addSingleLink(s3, l4, i5, u2) {
    let A6 = { start: s3, end: l4, type: void 0, text: "", labelType: "text", classes: [], isUserDefinedId: false, interpolate: this.defaultInterpolate }, n2 = i5?.text;
    if (n2 !== void 0 && (A6.text = Et(n2.text.trim()), A6.labelType = De(n2.type)), i5 !== void 0 && (A6.type = i5.type, A6.stroke = i5.stroke, A6.length = i5.length > 10 ? 10 : i5.length), u2 && !this.edgeById.has(u2)) A6.id = u2, A6.isUserDefinedId = true;
    else {
      let h7 = this.pairCount.get(s3 + "\0" + l4) ?? 0;
      A6.id = `L_${s3}_${l4}_${h7 === 0 ? 0 : h7 + 1}`;
    }
    let e2 = this.options.maxEdges;
    if (e2 !== void 0 && this.edges.length >= e2) throw new x2(`Edge limit exceeded. ${this.edges.length} edges found, but the limit is ${e2}.`, "limit", { type: "flowchart" });
    this.edges.push(A6);
    let I5 = s3 + "\0" + l4;
    this.pairCount.set(I5, (this.pairCount.get(I5) ?? 0) + 1), this.edgeById.has(A6.id) || this.edgeById.set(A6.id, A6);
  }
  addLink(s3, l4, i5) {
    let u2 = typeof i5?.id == "string" ? i5.id.replace("@", "") : void 0, A6 = s3[s3.length - 1], n2 = l4[0];
    for (let e2 of s3) for (let I5 of l4) this.addSingleLink(e2, I5, i5, e2 === A6 && I5 === n2 ? u2 : void 0);
  }
  updateLinkInterpolate(s3, l4) {
    for (let i5 of s3) i5 === "default" ? this.defaultInterpolate = l4 : this.edgeAt(i5).interpolate = l4;
  }
  updateLink(s3, l4) {
    for (let i5 of s3) {
      if (i5 === "default") {
        this.defaultEdgeStyle = l4;
        continue;
      }
      let u2 = this.edgeAt(i5);
      u2.style = l4, l4.length > 0 && !l4.some((A6) => A6?.startsWith("fill")) && l4.push("fill:none");
    }
  }
  edgeAt(s3) {
    let l4 = this.edges[Number(s3)];
    if (l4 === void 0) throw new x2(`The index ${s3} for linkStyle is out of bounds. Valid indices for linkStyle are between 0 and ${this.edges.length - 1}. (Help: Ensure that the index is within the range of existing edges.)`, "semantic", { type: "flowchart" });
    return l4;
  }
  addClass(s3, l4) {
    let i5 = l4.join().replace(/\\,/g, "\xA7\xA7\xA7").replace(/,/g, ";").replace(/§§§/g, ",").split(";");
    for (let u2 of s3.split(",")) {
      let A6 = this.classes.get(u2);
      A6 === void 0 && (A6 = { id: u2, styles: [], textStyles: [] }, this.classes.set(u2, A6));
      for (let n2 of i5) n2.includes("color") && A6.textStyles.push(n2.replace("fill", "bgFill")), A6.styles.push(n2);
    }
  }
  setDirection(s3) {
    let l4 = s3.trim();
    l4.includes("<") && (l4 = "RL"), l4.includes("^") && (l4 = "BT"), l4.includes(">") && (l4 = "LR"), l4.includes("v") && (l4 = "TB"), l4 === "TD" && (l4 = "TB"), this.direction = l4;
  }
  setClass(s3, l4) {
    for (let i5 of s3.split(",")) this.nodes.get(i5)?.classes.push(l4), this.edgeById.get(i5)?.classes.push(l4), this.subgraphLookup.get(i5)?.classes.push(l4);
  }
  setTooltip(s3, l4) {
    if (l4 !== void 0) for (let i5 of s3.split(",")) this.tooltips.set(i5, l4);
  }
  setLink(s3, l4, i5) {
    let u2 = l4.trim();
    for (let A6 of s3.split(",")) {
      let n2 = this.nodes.get(A6);
      n2 !== void 0 && (n2.link = u2 ? A4(u2) : void 0, n2.linkTarget = i5);
    }
    this.setClass(s3, "clickable");
  }
  setClickEvent(s3, l4, i5) {
    this.setClass(s3, "clickable");
  }
  setAccTitle(s3) {
    this.accTitle = s3.replace(/^\s+/g, "");
  }
  setAccDescription(s3) {
    this.accDescr = s3.replace(/\n\s+/g, `
`);
  }
  addSubGraph(s3, l4, i5) {
    let u2 = s3?.text.trim(), A6 = i5?.text ?? "";
    s3 !== void 0 && s3 === i5 && /\s/.test(A6) && (u2 = void 0);
    let n2 = /* @__PURE__ */ new Set(), e2 = [], I5;
    for (let m5 of l4) if (typeof m5 == "string") m5.trim() !== "" && !n2.has(m5) && (n2.add(m5), e2.push(m5));
    else if (Array.isArray(m5)) for (let C6 of m5) C6.trim() !== "" && !n2.has(C6) && (n2.add(C6), e2.push(C6));
    else I5 = m5.value;
    I5 ?? (I5 = this.options.inheritDir ? this.direction ?? this.options.direction : void 0), u2 ?? (u2 = "subGraph" + this.subCount), A6 = A6 || "", this.subCount++;
    let h7 = { id: u2, nodes: e2, title: A6.trim(), classes: [], dir: I5, labelType: De(i5?.type) }, D4 = this.members;
    h7.nodes = e2.filter((m5) => !D4.has(m5) && m5 !== u2);
    for (let m5 of h7.nodes) D4.add(m5);
    let k4 = this.subgraphLookup.get(u2);
    if (k4) for (let m5 of h7.nodes) k4.nodes.push(m5);
    else this.subgraphs.push(h7);
    return this.subgraphLookup.set(u2, k4 ?? h7), u2;
  }
  exists(s3, l4) {
    for (let i5 of s3) if (i5.nodes.includes(l4)) return true;
    return false;
  }
  makeUniq(s3, l4) {
    let i5 = /* @__PURE__ */ new Set();
    for (let u2 of l4) for (let A6 of u2.nodes) i5.add(A6);
    return { nodes: s3.nodes.filter((u2) => !i5.has(u2)) };
  }
  destructLink(s3, l4) {
    let i5 = kt(s3);
    if (!l4) return i5;
    let u2 = Dt(l4);
    if (u2.stroke !== i5.stroke) return { type: "INVALID", stroke: "INVALID" };
    if (u2.type === "arrow_open") u2.type = i5.type;
    else {
      if (u2.type !== i5.type) return { type: "INVALID", stroke: "INVALID" };
      u2.type = "double_" + u2.type;
    }
    return u2.type === "double_arrow" && (u2.type = "double_arrow_point"), u2.length = i5.length, u2;
  }
  subgraph(s3) {
    return this.subgraphLookup.get(s3);
  }
};
var ke = ["$end", "INVALID", "acc_title", "acc_title_value", "acc_descr", "acc_descr_value", "acc_descr_multiline_value", "SHAPE_DATA", "CALLBACKNAME", "CALLBACKARGS", "MD_STR", "STR", "STYLE", "DEFAULT", "LINKSTYLE", "INTERPOLATE", "CLASSDEF", "CLASS", "HREF", "CLICK", "GRAPH", "subgraph", "end", "LINK_TARGET", "NODIR", "DIR", "direction_tb", "direction_bt", "direction_rl", "direction_lr", "direction_td", "LINK_ID", "NUM", "BRKT", "STYLE_SEPARATOR", "COLON", "AMP", "SEMI", "COMMA", "MULT", "LINK", "START_LINK", "EDGE_TEXT", "-)", "TEXT", "(-", "STADIUMEND", "STADIUMSTART", "SUBROUTINEEND", "SUBROUTINESTART", "VERTEX_WITH_PROPS_START", "TAGEND", "CYLINDEREND", "CYLINDERSTART", "DOUBLECIRCLEEND", "DOUBLECIRCLESTART", "TRAPEND", "INVTRAPEND", "TRAPSTART", "INVTRAPSTART", "TAGSTART", "UP", "SEP", "DOWN", "NODE_STRING", "MINUS", "UNICODE_TEXT", "PIPE", "PE", "PS", "SQE", "SQS", "DIAMOND_STOP", "DIAMOND_START", "NEWLINE", "SPACE", "EOF"];
var Tt3 = new Uint8Array(128);
for (let o3 of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!\"#$%&'*+.`?\\_/") Tt3[o3.charCodeAt(0)] = 1;
var wt4 = /accTitle\s*:\s*/y;
var xt = /accDescr\s*:\s*/y;
var Ot2 = /accDescr\s*\{\s*/y;
var Pt = /call\s+/y;
var Mt2 = /click\s+/y;
var vt = /(?:\r?\n)*\s*\n/y;
var Ft = /\s*(?:LR|RL|TB|BT|TD|BR)\b/y;
var Ut = /\s*[<>^]/y;
var Gt2 = /\s*v\b/y;
var $t3 = [/.*direction\s+TB[^\n]*/y, /.*direction\s+BT[^\n]*/y, /.*direction\s+RL[^\n]*/y, /.*direction\s+LR[^\n]*/y, /.*direction\s+TD[^\n]*/y];
var we = /[\n\r\u2028\u2029]/g;
var St2 = /\s*[xo<]?--+[-xo>]\s*/y;
var Kt2 = /\s*[xo<]?--\s*/y;
var At = /\s*[xo<]?==+[=xo>]\s*/y;
var Bt2 = /\s*[xo<]?==\s*/y;
var xe = /\s*[xo<]?-?\.+-[xo>]?\s*/y;
var Vt2 = /\s*[xo<]?-\.\s*/y;
var mt2 = /\s*~~~+\s*/y;
var Wt2 = /(?:\r?\n)+/y;
var Ht2 = /[^\S\n\r]+/y;
var Yt2 = /\(\s*\)/y;
var Xt2 = /\n\s*/g;
function bt3(o3) {
  let s3 = o3.length, l4 = [], i5 = [], u2 = [], A6 = [], n2 = 0, e2 = 0, I5 = true, h7 = o3.indexOf("direction"), D4 = o3.indexOf("@"), k4 = -1, m5 = 0, C6 = 0, N4 = -1, w5 = -1, G3 = -1, f3 = (t, c3, r2) => {
    l4.push(t), i5.push(o3.slice(c3, r2)), u2.push(c3), e2 = r2;
  }, b4 = (t) => {
    A6.push(n2), n2 = t;
  }, d4 = () => {
    A6.length > 0 && (n2 = A6.pop());
  }, p4 = (t, c3) => (t.lastIndex = c3, t.test(o3) ? t.lastIndex : -1), T5 = (t) => o3.startsWith(t, e2) && !i(o3.charCodeAt(e2 + t.length)), y6 = (t) => {
    let c3 = t;
    if (t >= w5 && t <= G3) c3 = G3;
    else if (e(o3.charCodeAt(t))) {
      for (; c3 < s3 && e(o3.charCodeAt(c3)); ) c3++;
      w5 = t, G3 = c3;
    }
    let r2 = o3.charCodeAt(c3);
    return r2 === 120 || r2 === 111 || r2 === 60 ? o3.charCodeAt(c3 + 1) : r2;
  }, x5 = (t) => {
    let c3 = t;
    if (t >= w5 && t <= G3) c3 = G3;
    else if (e(o3.charCodeAt(t))) {
      for (; c3 < s3 && e(o3.charCodeAt(c3)); ) c3++;
      w5 = t, G3 = c3;
    }
    return o3.charCodeAt(c3) === 126;
  }, P4 = () => {
    o3.charCodeAt(e2 + 1) === 96 ? (b4(2), e2 += 2) : (b4(1), e2++);
  }, W3 = () => {
    if (!x5(e2)) return false;
    let t = p4(mt2, e2);
    return t < 0 ? false : (f3(40, e2, t), true);
  }, v4 = (t) => {
    let c3 = o3.charCodeAt(e2 + 1);
    return t === 40 ? (c3 === 45 ? (b4(8), f3(45, e2, e2 + 2)) : c3 === 91 ? (b4(7), f3(47, e2, e2 + 2)) : c3 === 40 && o3.charCodeAt(e2 + 2) === 40 ? (b4(7), f3(55, e2, e2 + 3)) : (b4(7), f3(69, e2, e2 + 1)), true) : t === 91 ? (c3 === 91 ? (b4(7), f3(49, e2, e2 + 2)) : c3 === 40 ? (b4(7), f3(53, e2, e2 + 2)) : c3 === 47 ? (b4(9), f3(58, e2, e2 + 2)) : c3 === 92 ? (b4(9), f3(59, e2, e2 + 2)) : (b4(7), f3(71, e2, e2 + 1)), true) : t === 124 ? (b4(7), f3(67, e2, e2 + 1), true) : t === 123 ? (b4(7), f3(73, e2, e2 + 1), true) : false;
  }, te = (t) => {
    I5 && (I5 = false, b4(6)), f3(20, e2, e2 + t);
  }, j4 = () => {
    let t = e2;
    for (; t < s3; ) {
      let c3 = o3.charCodeAt(t);
      if (c3 < 128 && Tt3[c3] === 1) t++;
      else if (c3 === 45 && t + 1 < s3) {
        let r2 = o3.charCodeAt(t + 1);
        if (r2 === 62 || r2 === 45 || r2 === 46) break;
        t++;
      } else break;
    }
    return t === e2 ? false : (f3(64, e2, t), true);
  }, q5 = (t) => {
    let c3 = y6(e2), r2;
    if (c3 === 45) {
      if ((r2 = p4(St2, e2)) >= 0) return f3(40, e2, r2), true;
      if ((r2 = p4(Kt2, e2)) >= 0) return b4(10), f3(41, e2, r2), true;
      if ((r2 = p4(xe, e2)) >= 0) return f3(40, e2, r2), true;
      if ((r2 = p4(Vt2, e2)) >= 0) return b4(12), f3(41, e2, r2), true;
    } else if (c3 === 61) {
      if ((r2 = p4(At, e2)) >= 0) return f3(40, e2, r2), true;
      if ((r2 = p4(Bt2, e2)) >= 0) return b4(11), f3(41, e2, r2), true;
    } else if (c3 === 46 && (r2 = p4(xe, e2)) >= 0) return f3(40, e2, r2), true;
    return t !== 45 && t !== 61 && t !== 46 && W3();
  }, oe = (t) => {
    let c3;
    switch (t) {
      case 97:
        if (o3.startsWith("acc", e2)) {
          if ((c3 = p4(wt4, e2)) >= 0) return b4(3), f3(2, e2, c3), true;
          if ((c3 = p4(xt, e2)) >= 0) return b4(4), f3(4, e2, c3), true;
          if ((c3 = p4(Ot2, e2)) >= 0) return b4(5), e2 = c3, true;
        }
        break;
      case 64:
        if (o3.charCodeAt(e2 + 1) === 123) return b4(16), l4.push(7), i5.push(""), u2.push(e2), e2 += 2, true;
        break;
      case 99:
        if ((c3 = p4(Pt, e2)) >= 0) return b4(14), e2 = c3, true;
        if (T5("classDef")) return f3(16, e2, e2 + 8), true;
        if (T5("class")) return f3(17, e2, e2 + 5), true;
        if ((c3 = p4(Mt2, e2)) >= 0) return b4(13), e2 = c3, true;
        break;
      case 34:
        return P4(), true;
      case 115:
        if (T5("style")) return f3(12, e2, e2 + 5), true;
        if (T5("swimlane-beta")) return te(13), true;
        if (T5("subgraph")) return f3(21, e2, e2 + 8), true;
        break;
      case 100:
        if (T5("default")) return f3(13, e2, e2 + 7), true;
        break;
      case 108:
        if (T5("linkStyle")) return f3(14, e2, e2 + 9), true;
        break;
      case 105:
        if (T5("interpolate")) return f3(15, e2, e2 + 11), true;
        break;
      case 104:
        if (o3.startsWith("href", e2) && e(o3.charCodeAt(e2 + 4))) return f3(18, e2, e2 + 5), true;
        break;
      case 102:
        if (T5("flowchart-elk")) return te(13), true;
        if (T5("flowchart")) return te(9), true;
        break;
      case 103:
        if (T5("graph")) return te(5), true;
        break;
      case 101:
        if (T5("end")) {
          for (c3 = e2 + 3; c3 < s3 && e(o3.charCodeAt(c3)); ) c3++;
          return f3(22, e2, c3), true;
        }
        break;
      case 95:
        if (T5("_self")) return f3(23, e2, e2 + 5), true;
        if (T5("_blank")) return f3(23, e2, e2 + 6), true;
        if (T5("_parent")) return f3(23, e2, e2 + 7), true;
        if (T5("_top")) return f3(23, e2, e2 + 4), true;
        break;
    }
    if (h7 !== -1 && e2 >= m5 && (h7 < e2 && (h7 = o3.indexOf("direction", e2)), h7 !== -1 && (k4 < e2 && (we.lastIndex = e2, k4 = we.test(o3) ? we.lastIndex - 1 : s3), h7 < k4))) {
      for (let r2 = 0; r2 < 5; r2++) if ((c3 = p4($t3[r2], e2)) >= 0) return f3(26 + r2, e2, c3), true;
      m5 = k4;
    }
    if (D4 !== -1 && t !== 34 && !e(t)) {
      if (e2 >= C6) {
        D4 < e2 && (D4 = o3.indexOf("@", e2));
        let r2 = e2;
        for (; r2 < s3; ) {
          let E6 = o3.charCodeAt(r2);
          if (E6 === 34 || e(E6)) break;
          r2++;
        }
        if (C6 = r2, N4 = -1, D4 !== -1 && D4 < r2) for (let E6 = Math.min(r2, s3 - 1) - 1; E6 >= D4; E6--) {
          if (o3.charCodeAt(E6) !== 64) continue;
          let R5 = o3.charCodeAt(E6 + 1);
          if (R5 !== 123 && R5 !== 34) {
            N4 = E6;
            break;
          }
        }
      }
      if (N4 > e2) return f3(31, e2, N4 + 1), true;
    }
    if (t >= 48 && t <= 57) {
      let r2 = e2 + 1;
      for (; r2 < s3; ) {
        let E6 = o3.charCodeAt(r2);
        if (E6 < 48 || E6 > 57) break;
        r2++;
      }
      return f3(32, e2, r2), true;
    }
    switch (t) {
      case 35:
        return f3(33, e2, e2 + 1), true;
      case 58:
        return o3.charCodeAt(e2 + 1) === 58 && o3.charCodeAt(e2 + 2) === 58 ? f3(34, e2, e2 + 3) : f3(35, e2, e2 + 1), true;
      case 38:
        return f3(36, e2, e2 + 1), true;
      case 59:
        return f3(37, e2, e2 + 1), true;
      case 44:
        return f3(38, e2, e2 + 1), true;
      case 42:
        return f3(39, e2, e2 + 1), true;
      case 120:
      case 111:
        return q5(t) || j4();
      case 60:
        return q5(t) || f3(60, e2, e2 + 1), true;
      case 45:
        return q5(t) || j4() || f3(65, e2, e2 + 1), true;
      case 61:
        return q5(t);
      case 46:
        return q5(t) || j4();
      case 126:
        return W3();
      case 40:
        return v4(t);
      case 91:
        return o3.charCodeAt(e2 + 1) === 124 ? (f3(50, e2, e2 + 2), true) : v4(t);
      case 124:
      case 123:
        return v4(t);
      case 62:
        return b4(7), f3(51, e2, e2 + 1), true;
      case 94:
        return f3(61, e2, e2 + 1), true;
      case 92:
        return o3.charCodeAt(e2 + 1) === 124 ? (f3(62, e2, e2 + 2), true) : j4();
      case 118:
        return i(o3.charCodeAt(e2 + 1)) ? j4() : (f3(63, e2, e2 + 1), true);
    }
    return e(t) ? q5(t) ? true : (c3 = p4(Wt2, e2)) >= 0 ? (f3(74, e2, c3), true) : (c3 = p4(Ht2, e2)) >= 0 ? (f3(75, e2, c3), true) : false : t < 128 ? j4() : h2(t) ? (f3(66, e2, e2 + 1), true) : false;
  }, a2 = (t, c3, r2, E6) => {
    if (t === 34) return P4(), true;
    let R5 = y6(e2);
    if (R5 === r2 || R5 === E6) {
      let Y3 = p4(c3, e2);
      if (Y3 >= 0) return d4(), f3(40, e2, Y3), true;
    }
    if (t === r2 && (r2 !== 45 || o3.charCodeAt(e2 + 1) === 45)) return false;
    let z4 = e2 + 1;
    for (; z4 < s3; ) {
      let Y3 = o3.charCodeAt(z4);
      if (Y3 === 34) break;
      if (Y3 === r2) {
        if (r2 !== 45 || o3.charCodeAt(z4 + 1) === 45) break;
      } else if (Y3 === 120 || Y3 === 111 || Y3 === 60 || Y3 === E6 || e(Y3)) {
        let se3 = y6(z4);
        if ((se3 === r2 || se3 === E6) && p4(c3, z4) >= 0) break;
      }
      z4++;
    }
    return f3(42, e2, z4), true;
  };
  e: for (; ; ) {
    if (e2 >= s3) {
      let r2 = -1;
      switch (n2) {
        case 0:
          r2 = 76;
          break;
        case 3:
          r2 = 3;
          break;
        case 4:
          r2 = 5;
          break;
        case 5:
          r2 = 6;
          break;
        case 13:
          r2 = 19;
          break;
        case 14:
          r2 = 8;
          break;
        case 15:
          r2 = 9;
          break;
      }
      r2 !== -1 && f3(r2, s3, s3);
      break;
    }
    let t = o3.charCodeAt(e2), c3 = true;
    switch (n2) {
      case 0:
        c3 = oe(t);
        break;
      case 1:
        if (t === 34) o3.charCodeAt(e2 + 1) === 96 ? (b4(2), e2 += 2) : (d4(), e2++);
        else {
          let r2 = o3.indexOf('"', e2);
          f3(11, e2, r2 === -1 ? s3 : r2);
        }
        break;
      case 2:
        if (t === 96) o3.charCodeAt(e2 + 1) === 34 ? (d4(), e2 += 2) : c3 = false;
        else if (t === 34) P4();
        else {
          let r2 = e2 + 1;
          for (; r2 < s3; ) {
            let E6 = o3.charCodeAt(r2);
            if (E6 === 96 || E6 === 34) break;
            r2++;
          }
          f3(10, e2, r2);
        }
        break;
      case 3:
      case 4: {
        let r2 = o3.indexOf(`
`, e2);
        r2 === -1 && (r2 = s3);
        let E6 = n2 === 3 ? 3 : 5;
        d4(), f3(E6, e2, r2);
        break;
      }
      case 5:
        if (t === 125) d4(), e2++;
        else {
          let r2 = o3.indexOf("}", e2);
          r2 === -1 && (r2 = s3), f3(6, e2, r2);
        }
        break;
      case 6: {
        let r2;
        t === 34 ? P4() : (r2 = p4(vt, e2)) >= 0 ? (d4(), f3(24, e2, r2)) : (r2 = p4(Ft, e2)) >= 0 || (r2 = p4(Ut, e2)) >= 0 || (r2 = p4(Gt2, e2)) >= 0 ? (d4(), f3(25, e2, r2)) : c3 = W3() || v4(t);
        break;
      }
      case 7: {
        let r2 = o3.charCodeAt(e2 + 1);
        switch (t) {
          case 34:
            P4();
            break;
          case 40:
          case 91:
          case 123:
            v4(t);
            break;
          case 93:
            d4(), r2 === 41 ? f3(46, e2, e2 + 2) : r2 === 93 ? f3(48, e2, e2 + 2) : f3(70, e2, e2 + 1);
            break;
          case 41:
            d4(), r2 === 93 ? f3(52, e2, e2 + 2) : r2 === 41 && o3.charCodeAt(e2 + 2) === 41 ? f3(54, e2, e2 + 3) : f3(68, e2, e2 + 1);
            break;
          case 124:
            d4(), f3(67, e2, e2 + 1);
            break;
          case 125:
            d4(), f3(72, e2, e2 + 1);
            break;
          default: {
            if ((t === 126 || e(t)) && W3()) break;
            let E6 = e2 + 1;
            for (; E6 < s3; ) {
              let R5 = o3.charCodeAt(E6);
              if (R5 === 91 || R5 === 93 || R5 === 40 || R5 === 41 || R5 === 123 || R5 === 125 || R5 === 124 || R5 === 34) break;
              E6++;
            }
            f3(44, e2, E6);
          }
        }
        break;
      }
      case 8: {
        let r2 = o3.charCodeAt(e2 + 1);
        if (t === 34) P4();
        else {
          if ((t === 126 || e(t)) && W3()) break;
          if ((t === 45 || t === 47 || t === 41) && r2 === 41) d4(), f3(43, e2, e2 + 2);
          else if (t === 40 || t === 91 || t === 123) v4(t);
          else if (t === 41 || t === 93 || t === 125) c3 = false;
          else {
            let E6 = e2 + 1;
            for (; E6 < s3; ) {
              let R5 = o3.charCodeAt(E6);
              if (R5 === 34 || R5 === 40 || R5 === 41 || R5 === 91 || R5 === 93 || R5 === 123 || R5 === 125 || (R5 === 45 || R5 === 47) && o3.charCodeAt(E6 + 1) === 41 || (R5 === 126 || e(R5)) && x5(E6) && p4(mt2, E6) >= 0) break;
              E6++;
            }
            f3(44, e2, E6);
          }
        }
        break;
      }
      case 9: {
        let r2 = o3.charCodeAt(e2 + 1);
        if (t === 34) {
          P4();
          break;
        }
        if ((t === 126 || e(t)) && W3()) break;
        switch (t) {
          case 40:
            r2 === 45 || r2 === 91 || r2 === 40 && o3.charCodeAt(e2 + 2) === 40 ? v4(t) : r2 === 93 ? (d4(), f3(56, e2, e2 + 2)) : v4(t);
            break;
          case 91:
          case 123:
            v4(t);
            break;
          case 92:
            r2 === 93 ? (d4(), f3(56, e2, e2 + 2)) : f3(44, e2, e2 + 1);
            break;
          case 47:
            r2 === 93 ? (d4(), f3(57, e2, e2 + 2)) : f3(44, e2, e2 + 1);
            break;
          case 93:
          case 41:
            r2 === 93 ? (d4(), f3(56, e2, e2 + 2)) : c3 = false;
            break;
          case 125:
            c3 = false;
            break;
          default: {
            if ((t === 63 || t === 61) && r2 === 93) {
              d4(), f3(56, e2, e2 + 2);
              break;
            }
            let E6 = e2 + 1;
            for (; E6 < s3; ) {
              let R5 = o3.charCodeAt(E6);
              if (R5 === 92 || R5 === 91 || R5 === 93 || R5 === 40 || R5 === 41 || R5 === 123 || R5 === 125 || R5 === 47) break;
              E6++;
            }
            f3(44, e2, E6);
          }
        }
        break;
      }
      case 10:
        c3 = a2(t, St2, 45, -1);
        break;
      case 11:
        c3 = a2(t, At, 61, -1);
        break;
      case 12:
        c3 = a2(t, xe, 46, 45);
        break;
      case 13:
        if (t === 34) P4();
        else if (e(t)) d4(), e2++;
        else {
          let r2 = e2 + 1;
          for (; r2 < s3 && !e(o3.charCodeAt(r2)); ) r2++;
          f3(19, e2, r2);
        }
        break;
      case 14:
        if (t === 40) {
          let r2 = p4(Yt2, e2);
          d4(), r2 >= 0 ? e2 = r2 : (b4(15), e2++);
        } else {
          let r2 = o3.indexOf("(", e2);
          r2 === -1 && (r2 = s3), f3(8, e2, r2);
        }
        break;
      case 15:
        if (t === 41) d4(), e2++;
        else {
          let r2 = o3.indexOf(")", e2);
          r2 === -1 && (r2 = s3), f3(9, e2, r2);
        }
        break;
      case 16:
        if (t === 34) b4(17), f3(7, e2, e2 + 1);
        else if (t === 125) d4(), e2++;
        else if (t === 94) c3 = false;
        else {
          let r2 = e2 + 1;
          for (; r2 < s3; ) {
            let E6 = o3.charCodeAt(r2);
            if (E6 === 125 || E6 === 94 || E6 === 34) break;
            r2++;
          }
          f3(7, e2, r2);
        }
        break;
      case 17:
        if (t === 34) d4(), f3(7, e2, e2 + 1);
        else {
          let r2 = o3.indexOf('"', e2);
          r2 === -1 && (r2 = s3), l4.push(7), i5.push(o3.slice(e2, r2).replace(Xt2, "<br/>")), u2.push(e2), e2 = r2;
        }
        break;
    }
    if (!c3) return l4.push(1), i5.push(""), u2.push(e2), { types: l4, texts: i5, starts: u2 };
    continue e;
  }
  return l4.push(0), i5.push(""), u2.push(s3), { types: l4, texts: i5, starts: u2 };
}
var Se2 = new Uint8Array(77);
for (let o3 of [32, 64, 63, 65, 13, 38, 35, 36, 33, 39, 66]) Se2[o3] = 1;
var Oe2 = new Uint8Array(77);
for (let o3 of [32, 66, 64, 25, 63, 65, 38, 35, 36, 33, 39]) Oe2[o3] = 1;
var Pe2 = new Uint8Array(77);
for (let o3 of [32, 64, 75, 65, 36, 66, 35, 39, 33, 12, 14, 16, 17, 19, 20, 25, 21, 22, 63, 61, 41]) Pe2[o3] = 1;
var Me = new Uint8Array(77);
for (let o3 of [32, 64, 35, 75, 33, 12]) Me[o3] = 1;
var It = "'UNICODE_TEXT', 'TEXT', 'TAGSTART'";
var ue = [];
var jt3 = /}\s*\n/g;
function _t4(o3, s3) {
  let l4 = o3.includes("}") ? o3.replace(jt3, `}
`) : o3, { types: i5, texts: u2, starts: A6 } = bt3(l4), n2 = 0, e2, I5 = (a2) => {
    let t = i5[n2];
    throw t === 1 ? L2("flowchart", l4, A6[n2], "", true) : L2("flowchart", l4, A6[n2], `Expecting ${a2}, got '${ke[t]}'`);
  }, h7 = (a2, t = "") => (i5[n2] !== a2 && I5(`'${ke[a2]}'${t ? ", " + t : ""}`), u2[n2++]), D4 = () => {
    let a2 = i5[n2];
    a2 !== 74 && a2 !== 37 && a2 !== 76 && I5("'SEMI', 'NEWLINE', 'EOF'"), n2++;
  }, k4 = () => {
    Se2[i5[n2]] === 0 && I5("'NODE_STRING'");
    let a2 = u2[n2++];
    for (; Se2[i5[n2]] === 1; ) a2 += u2[n2++];
    return a2;
  }, m5 = () => {
    Oe2[i5[n2]] === 0 && I5("'NODE_STRING'");
    let a2 = u2[n2++];
    for (; Oe2[i5[n2]] === 1; ) a2 += u2[n2++];
    return a2;
  }, C6 = () => {
    let a2 = i5[n2], t;
    if (a2 === 11) t = "string";
    else if (a2 === 10) t = "markdown";
    else if (a2 === 44 || a2 === 60 || a2 === 51 || a2 === 66) t = "text";
    else return I5(`${It}, 'TAGEND', 'STR', 'MD_STR'`);
    let c3 = u2[n2++];
    for (; ; ) {
      let r2 = i5[n2];
      if (r2 !== 44 && r2 !== 60 && r2 !== 51 && r2 !== 66) break;
      c3 += u2[n2++];
    }
    return { text: c3, type: t };
  }, N4 = (a2) => {
    h7(a2, It);
  }, w5 = () => {
    let a2 = i5[n2], t;
    if (a2 === 11) t = "string";
    else if (a2 === 10) t = "markdown";
    else if (a2 === 42 || a2 === 66) t = "text";
    else return I5("'EDGE_TEXT', 'STR', 'MD_STR'");
    let c3 = u2[n2++];
    for (; i5[n2] === 42 || i5[n2] === 66; ) c3 += u2[n2++];
    return { text: c3, type: t };
  }, G3 = () => {
    let a2 = i5[n2], t;
    if (a2 === 11) t = "text";
    else if (a2 === 10) t = "markdown";
    else if (Pe2[a2] === 1) t = "text";
    else return I5("'NODE_STRING', 'STR', 'MD_STR'");
    let c3 = u2[n2++];
    for (; Pe2[i5[n2]] === 1; ) c3 += u2[n2++];
    return { text: c3, type: t };
  }, f3 = () => {
    let a2 = u2[n2++];
    for (; i5[n2] === 7; ) a2 += u2[n2++];
    return a2;
  }, b4 = () => {
    let a2 = k4(), t;
    switch (i5[n2]) {
      case 71:
        n2++, t = C6(), N4(70), s3.addVertex(a2, t, "square");
        break;
      case 55:
        n2++, t = C6(), N4(54), s3.addVertex(a2, t, "doublecircle");
        break;
      case 69:
        n2++, i5[n2] === 69 ? (n2++, t = C6(), N4(68), h7(68), s3.addVertex(a2, t, "circle")) : (t = C6(), N4(68), s3.addVertex(a2, t, "round"));
        break;
      case 45:
        n2++, t = C6(), N4(43), s3.addVertex(a2, t, "ellipse");
        break;
      case 47:
        n2++, t = C6(), N4(46), s3.addVertex(a2, t, "stadium");
        break;
      case 49:
        n2++, t = C6(), N4(48), s3.addVertex(a2, t, "subroutine");
        break;
      case 50: {
        n2++;
        let c3 = h7(64);
        h7(35);
        let r2 = h7(64);
        h7(67), t = C6(), N4(70), s3.addVertex(a2, t, "rect", void 0, void 0, void 0, { [c3]: r2 });
        break;
      }
      case 53:
        n2++, t = C6(), N4(52), s3.addVertex(a2, t, "cylinder");
        break;
      case 73:
        n2++, i5[n2] === 73 ? (n2++, t = C6(), N4(72), h7(72), s3.addVertex(a2, t, "hexagon")) : (t = C6(), N4(72), s3.addVertex(a2, t, "diamond"));
        break;
      case 51:
        n2++, t = C6(), N4(70), s3.addVertex(a2, t, "odd");
        break;
      case 58:
        n2++, t = C6(), i5[n2] === 57 ? (n2++, s3.addVertex(a2, t, "lean_right")) : (N4(56), s3.addVertex(a2, t, "trapezoid"));
        break;
      case 59:
        n2++, t = C6(), i5[n2] === 56 ? (n2++, s3.addVertex(a2, t, "lean_left")) : (N4(57), s3.addVertex(a2, t, "inv_trapezoid"));
        break;
      default:
        s3.addVertex(a2);
    }
    return a2;
  }, d4 = () => {
    let a2 = b4();
    return i5[n2] === 34 && (n2++, s3.setClass(a2, k4())), a2;
  }, p4 = () => {
    let a2 = [d4()];
    for (e2 = void 0; ; ) {
      let t = i5[n2] === 7 ? f3() : void 0;
      if (i5[n2] !== 75) return e2 = t, a2;
      do
        n2++;
      while (i5[n2] === 75);
      if (i5[n2] !== 36) return t !== void 0 && I5("'AMP'"), a2;
      n2++, i5[n2] !== 75 && I5("'SPACE'");
      do
        n2++;
      while (i5[n2] === 75);
      let c3 = d4();
      t !== void 0 && s3.addVertex(a2[a2.length - 1], void 0, void 0, void 0, void 0, void 0, void 0, t), a2.push(c3);
    }
  }, T5 = () => {
    let a2;
    if (i5[n2] === 31 && (a2 = u2[n2++]), i5[n2] === 40) {
      let t = s3.destructLink(u2[n2++]);
      return a2 !== void 0 && (t.id = a2), i5[n2] === 67 && (n2++, t.text = C6(), N4(67), i5[n2] === 75 && n2++), t;
    }
    if (i5[n2] === 41) {
      let t = u2[n2++], c3 = w5(), r2 = h7(40, "'EDGE_TEXT'"), E6 = s3.destructLink(r2, t);
      return E6.text = c3, a2 !== void 0 && (E6.id = a2), E6;
    }
    return I5("'LINK', 'START_LINK'");
  }, y6 = () => {
    let a2 = p4();
    e2 !== void 0 && s3.addVertex(a2[a2.length - 1], void 0, void 0, void 0, void 0, void 0, void 0, e2);
    let t = a2;
    for (; ; ) {
      let c3 = i5[n2];
      if (c3 !== 40 && c3 !== 41 && c3 !== 31) return t;
      let r2 = T5(), E6 = p4();
      e2 !== void 0 && s3.addVertex(E6[E6.length - 1], void 0, void 0, void 0, void 0, void 0, void 0, e2), s3.addLink(a2, E6, r2), t = E6.concat(t), a2 = E6;
    }
  }, x5 = () => {
    Me[i5[n2]] === 0 && I5("'NODE_STRING', 'NUM', 'COLON', 'BRKT'");
    let a2 = u2[n2++];
    for (; Me[i5[n2]] === 1; ) a2 += u2[n2++];
    return a2;
  }, P4 = () => {
    let a2 = [x5()];
    for (; i5[n2] === 38; ) n2++, a2.push(x5());
    return a2;
  }, W3 = () => {
    n2++, h7(75);
    let a2;
    if (i5[n2] === 13) a2 = [u2[n2++]];
    else for (a2 = [h7(32, "'DEFAULT'")]; i5[n2] === 38; ) n2++, a2.push(h7(32));
    if (h7(75), i5[n2] !== 15) {
      s3.updateLink(a2, P4());
      return;
    }
    n2++, h7(75);
    let t = m5();
    if (i5[n2] === 75) {
      n2++;
      let c3 = P4();
      s3.updateLinkInterpolate(a2, t), s3.updateLink(a2, c3);
    } else s3.updateLinkInterpolate(a2, t);
  }, v4 = (a2, t) => {
    if (i5[n2] !== 75) {
      s3.setLink(a2, t);
      return;
    }
    if (n2++, i5[n2] === 23) {
      s3.setLink(a2, t, u2[n2++]);
      return;
    }
    let c3 = h7(11, "'LINK_TARGET'");
    i5[n2] === 75 ? (n2++, s3.setLink(a2, t, h7(23))) : s3.setLink(a2, t), s3.setTooltip(a2, c3);
  }, te = () => {
    let a2 = u2[n2++];
    switch (i5[n2]) {
      case 8: {
        let t = u2[n2++], c3 = i5[n2] === 9, r2 = c3 ? u2[n2++] : void 0, E6;
        i5[n2] === 75 && (n2++, E6 = h7(11)), c3 ? s3.setClickEvent(a2, t, r2) : s3.setClickEvent(a2, t), E6 !== void 0 && s3.setTooltip(a2, E6);
        return;
      }
      case 18:
        n2++, v4(a2, h7(11));
        return;
      case 11:
        v4(a2, u2[n2++]);
        return;
      default: {
        let t = m5();
        if (i5[n2] === 75) {
          n2++;
          let c3 = h7(11);
          s3.setClickEvent(a2, t), s3.setTooltip(a2, c3);
        } else s3.setClickEvent(a2, t);
      }
    }
  }, j4 = () => {
    n2++;
    let a2 = i5[n2];
    if (a2 === 74 || a2 === 37 || a2 === 76) return n2++, { id: void 0, title: void 0, list: [], collect: false };
    h7(75, "'SEMI', 'NEWLINE', 'EOF'");
    let t = G3(), c3 = t;
    return i5[n2] === 71 && (n2++, c3 = C6(), N4(70)), a2 = i5[n2], a2 !== 74 && a2 !== 37 && a2 !== 76 && I5("'SEMI', 'NEWLINE', 'EOF', 'SQS'"), n2++, { id: t, title: c3, list: [], collect: false };
  }, q5 = () => {
    let a2 = i5[n2];
    switch (a2) {
      case 12: {
        n2++, h7(75);
        let t = k4();
        return h7(75), s3.addVertex(t, void 0, void 0, P4()), D4(), ue;
      }
      case 14:
        return W3(), D4(), ue;
      case 16: {
        n2++, h7(75);
        let t = k4();
        return h7(75), s3.addClass(t, P4()), D4(), ue;
      }
      case 17: {
        n2++, h7(75);
        let t = k4();
        return h7(75), s3.setClass(t, k4()), D4(), ue;
      }
      case 19:
        return te(), D4(), ue;
      case 26:
      case 27:
      case 28:
      case 29:
      case 30:
        return n2++, { stmt: "dir", value: zt2[a2 - 26] };
      case 2: {
        n2++;
        let t = h7(3).trim();
        return s3.setAccTitle(t), t;
      }
      case 4: {
        n2++;
        let t = h7(5).trim();
        return s3.setAccDescription(t), t;
      }
      case 6: {
        let t = u2[n2++].trim();
        return s3.setAccDescription(t), t;
      }
      default: {
        Se2[a2] === 0 && I5(Nt3);
        let t = y6();
        return D4(), t;
      }
    }
  }, oe = () => {
    let a2 = [], t = [], c3 = false;
    for (; ; ) {
      let r2 = i5[n2];
      if (r2 === 0) break;
      if (r2 === 22) {
        let E6 = a2.pop();
        if (E6 === void 0) break;
        n2++;
        let R5 = s3.addSubGraph(E6.id, t, E6.title);
        t = E6.list, c3 = E6.collect, c3 && t.push(R5);
      } else if (r2 === 37 || r2 === 74 || r2 === 75 || r2 === 76) c3 && t.push(u2[n2]), n2++;
      else if (r2 === 21) {
        let E6 = j4();
        E6.list = t, E6.collect = c3, a2.push(E6), t = [], c3 = true;
      } else {
        let E6 = q5();
        c3 && (!Array.isArray(E6) || E6.length > 0) && t.push(E6);
      }
    }
    a2.length > 0 && I5("'end'");
  };
  for (; i5[n2] === 75 || i5[n2] === 74; ) n2++;
  if (h7(20, "'SPACE', 'NEWLINE'"), i5[n2] === 24) n2++, s3.setDirection("TB");
  else {
    let a2 = h7(25, "'NODIR'"), t = i5[n2];
    if (t === 75) {
      do
        n2++;
      while (i5[n2] === 75);
      t = i5[n2], t !== 74 && I5("'NEWLINE', 'SPACE'");
    } else t !== 37 && t !== 74 && I5("'SEMI', 'NEWLINE', 'SPACE'");
    n2++, s3.setDirection(a2);
  }
  oe(), i5[n2] !== 0 && I5(Nt3);
}
var zt2 = ["TB", "BT", "RL", "LR", "TD"];
var Nt3 = "'SEMI', 'NEWLINE', 'SPACE', 'EOF', 'subgraph', 'acc_title', 'acc_descr', 'acc_descr_multiline_value', 'STYLE', 'LINKSTYLE', 'CLASSDEF', 'CLASS', 'CLICK', 'NODE_STRING'";
function Qt2(o3) {
  if (o3.img) return "imageSquare";
  if (o3.icon) return o3.form === "circle" ? "iconCircle" : o3.form === "square" ? "iconSquare" : o3.form === "rounded" ? "iconRounded" : "icon";
  switch (o3.type) {
    case "square":
    case void 0:
      return "squareRect";
    case "round":
      return "roundedRect";
    default:
      return o3.type;
  }
}
function qt2(o3) {
  switch (o3) {
    case "arrow_point":
    case "arrow_circle":
    case "arrow_cross":
      return ["none", o3];
    case "double_arrow_point":
    case "double_arrow_circle":
    case "double_arrow_cross": {
      let s3 = o3.replace("double_", "");
      return [s3, s3];
    }
  }
  return ["none", "arrow_point"];
}
function Rt2(o3, s3) {
  let l4 = [], i5 = [], u2 = o3.subgraphs, A6 = (d4) => {
    let p4 = [];
    for (let T5 of d4) {
      let y6 = o3.classes.get(T5);
      y6?.styles && (p4 = [...p4, ...y6.styles].map((x5) => x5.trim())), y6?.textStyles && (p4 = [...p4, ...y6.textStyles].map((x5) => x5.trim()));
    }
    return p4;
  }, n2 = /* @__PURE__ */ new Map();
  for (let d4 of u2) for (let p4 of d4.nodes) o3.subgraph(p4) && n2.set(p4, d4.id);
  let e2 = /* @__PURE__ */ new Map(), I5 = /* @__PURE__ */ new Map();
  for (let d4 of u2) {
    let p4 = n2.get(d4.id);
    if (p4 === void 0) continue;
    let T5 = I5.get(p4);
    T5 ? T5.push(d4.id) : I5.set(p4, [d4.id]);
  }
  let h7 = 0;
  for (let d4 of u2) {
    if (n2.has(d4.id)) continue;
    let p4 = [d4.id];
    for (; p4.length > 0; ) {
      let T5 = p4.pop();
      if (e2.has(T5)) continue;
      e2.set(T5, h7++);
      let y6 = I5.get(T5);
      if (y6) for (let x5 = y6.length - 1; x5 >= 0; x5--) p4.push(y6[x5]);
    }
  }
  let D4 = (d4) => o3.subgraph(d4)?.metadata?.view === "collapsed", k4 = false;
  for (let d4 of u2) d4.metadata?.view === "collapsed" && (k4 = true);
  let m5 = /* @__PURE__ */ new Map(), C6 = (d4) => {
    let p4 = [], T5 = /* @__PURE__ */ new Set(), y6 = d4;
    for (; y6 !== void 0 && !m5.has(y6) && !T5.has(y6); ) T5.add(y6), p4.push(y6), y6 = n2.get(y6);
    let x5 = y6 !== void 0 ? m5.get(y6) : void 0;
    for (let P4 = p4.length - 1; P4 >= 0; P4--) x5 === void 0 && D4(p4[P4]) && (x5 = p4[P4]), m5.set(p4[P4], x5);
    return x5;
  }, N4 = /* @__PURE__ */ new Set(), w5 = /* @__PURE__ */ new Map();
  for (let d4 of k4 ? u2 : []) {
    let p4 = C6(d4.id);
    if (p4 !== void 0) {
      d4.id !== p4 && (N4.add(d4.id), w5.set(d4.id, p4));
      for (let T5 of d4.nodes) T5 !== p4 && (N4.add(T5), w5.set(T5, p4));
    }
  }
  let G3 = /* @__PURE__ */ new Map(), f3 = /* @__PURE__ */ new Set();
  for (let d4 = u2.length - 1; d4 >= 0; d4--) {
    let p4 = u2[d4];
    if (!N4.has(p4.id)) {
      p4.nodes.length > 0 && f3.add(p4.id);
      for (let T5 of p4.nodes) G3.set(T5, p4.id);
    }
  }
  let b4 = /* @__PURE__ */ new Map();
  for (let d4 = u2.length - 1; d4 >= 0; d4--) {
    let p4 = u2[d4];
    if (N4.has(p4.id)) continue;
    let T5 = p4.metadata?.view === "collapsed", y6 = { id: p4.id, label: p4.title, labelType: p4.labelType, parentId: G3.get(p4.id), cssStyles: [], cssCompiledStyles: A6(p4.classes), cssClasses: p4.classes.join(" "), shape: T5 ? "collapsedGroup" : "rect", dir: p4.dir, isGroup: !T5, colorIndex: e2.get(p4.id) };
    T5 || (y6.metadata = p4.metadata), l4.push(y6), b4.set(p4.id, y6);
  }
  for (let d4 of o3.nodes.values()) {
    if (N4.has(d4.id)) continue;
    let p4 = b4.get(d4.id);
    if (p4) {
      p4.cssStyles = d4.styles, p4.cssCompiledStyles = A6(d4.classes), p4.cssClasses = d4.classes.join(" ");
      continue;
    }
    let T5 = f3.has(d4.id), y6 = { id: d4.id, label: d4.text, labelType: d4.labelType, parentId: G3.get(d4.id), cssStyles: d4.styles, cssCompiledStyles: A6(["default", "node", ...d4.classes]), cssClasses: "default " + d4.classes.join(" "), dir: d4.dir, link: d4.link, linkTarget: d4.linkTarget, tooltip: o3.tooltips.get(d4.id), icon: d4.icon, pos: d4.pos, img: d4.img, assetWidth: d4.assetWidth, assetHeight: d4.assetHeight, constraint: d4.constraint, isGroup: T5, shape: T5 ? "rect" : Qt2(d4) };
    l4.push(y6), b4.set(d4.id, y6);
  }
  return o3.edges.forEach((d4, p4) => {
    let T5 = w5.get(d4.start) ?? d4.start, y6 = w5.get(d4.end) ?? d4.end;
    if (T5 === y6 && (w5.has(d4.start) || w5.has(d4.end))) return;
    let [x5, P4] = qt2(d4.type), W3 = [...o3.defaultEdgeStyle ?? []];
    d4.style && W3.push(...d4.style);
    let v4 = d4.stroke === "invisible" || d4.type === "arrow_open";
    i5.push({ id: d4.id || `L_${T5}_${y6}_${p4}`, isUserDefinedId: d4.isUserDefinedId, start: T5, end: y6, type: d4.type ?? "normal", label: d4.text, labelType: d4.labelType, thickness: d4.stroke, pattern: d4.stroke, minlen: d4.length, classes: d4.stroke === "invisible" ? "" : "edge-thickness-normal edge-pattern-solid flowchart-link", arrowTypeStart: v4 ? "none" : x5, arrowTypeEnd: v4 ? "none" : P4, cssCompiledStyles: A6(d4.classes), style: W3, animate: d4.animate, animation: d4.animation, curve: d4.interpolate || o3.defaultInterpolate || s3 });
  }), { nodes: l4, edges: i5 };
}
var Jt2 = 40;
var Zt2 = 16;
var en2 = 48;
var Lt2 = 20;
var ve = 26;
var Fe2 = ' fill="var(--_s)" stroke="var(--_b)"';
var tn2 = ' stroke="var(--_b)"';
function Ue2(o3, s3, l4) {
  let i5 = o3[s3];
  return typeof i5 == "number" && i5 > 0 ? Math.min(i5, 2e3) : l4;
}
function pe3(o3, s3) {
  return o3 !== void 0 && o3 > 0 && o3 <= 4e3 ? o3 : s3;
}
function yt2(o3, s3, l4, i5) {
  let u2 = (A6) => p3(l4, (n2) => nn2(o3, s3, l4, i5, A6, n2));
  return m4(o3.direction) ? c2(l4, u2) : u2(false);
}
function nn2(o3, s3, l4, i5, u2, A6) {
  let n2 = A6 ? 12 : Lt2, e2 = i5 ? s3[i5.type] : void 0, I5 = typeof e2 == "object" && e2 !== null && !Array.isArray(e2) ? e2 : s3.flowchart ?? {}, h7 = Rt2(o3, typeof I5.curve == "string" ? I5.curve : void 0);
  i5?.prepare(h7);
  let D4 = l4.fontSize ?? 16, k4 = Math.round(D4 * 0.875), m5 = l4.measurer ?? H(l4.fontFamily), C6 = Math.min(Ue2(I5, "wrappingWidth", 200), i5 && A6 ? 100 : 1 / 0), N4 = l4.padding ?? 8, w5 = l4.icons, G3 = /* @__PURE__ */ new Map(), f3 = [], b4 = [];
  h7.nodes.forEach((S5, g5) => G3.set(S5.id, g5));
  for (let S5 of h7.nodes) {
    let g5 = wt2(S5.cssStyles.length > 0 ? S5.cssCompiledStyles.concat(S5.cssStyles) : S5.cssCompiledStyles), L5 = (g5.bold ? 1 : 0) | (g5.italic ? 2 : 0), _5 = S5.labelType === "markdown", J2 = g5.fontSize ?? D4, X2, F3;
    if (S5.isGroup) {
      let O5 = Tt(S5.label, _5, m5, J2, i5 && A6 ? Math.max(80, h6(l4) / 2) : 4e3, L5);
      X2 = { node: S5, style: g5, label: O5, shape: "group", w: 0, h: 0, dy: 0, loops: 0 }, F3 = de2(0, 0), F3.isGroup = true, F3.dir = S5.dir ? be(S5.dir) : void 0, F3.padX = n2, F3.padTop = O5.height > 0 ? O5.height + 16 : Lt2, F3.padBottom = n2, F3.minW = O5.width + 2 * n2 - 12;
    } else {
      let O5 = i2(S5.shape), ie2 = S5.img || S5.icon || j3(O5) ? S5.label : void 0, K3 = Tt(ie2, _5, m5, J2, C6, L5), Q2, $4, Z4 = 0;
      if (S5.img || S5.icon) {
        let H4 = S5.img ? 80 : 48, M6 = pe3(S5.assetWidth, H4), V3 = pe3(S5.assetHeight, H4);
        Q2 = Math.max(M6, K3.width + 8), $4 = V3 + (K3.height > 0 ? K3.height + 6 : 0), Z4 = S5.pos === "t" ? -V3 / 2 : V3 / 2, K3.height === 0 && (Z4 = 0);
      } else {
        let H4 = P3(O5, K3.width, K3.height);
        Q2 = H4.w, $4 = H4.h, Z4 = H4.dy;
      }
      X2 = { node: S5, style: g5, label: K3, shape: O5, w: Q2, h: $4, dy: Z4, loops: 0 }, F3 = de2(Q2, $4);
    }
    F3.seq = f3.length, f3.push(X2), b4.push(F3);
  }
  h7.nodes.forEach((S5, g5) => {
    b4[g5].parent = S5.parentId !== void 0 ? G3.get(S5.parentId) ?? -1 : -1;
  });
  let d4 = u2 ? "TB" : be(o3.direction), p4 = (S5) => {
    let g5;
    for (let L5 = b4[S5].parent, _5 = 0; L5 >= 0 && g5 === void 0 && _5 < 1e4; L5 = b4[L5].parent, _5++) g5 = b4[L5].dir;
    return g5 ?? (g5 = d4), g5 === "LR" || g5 === "RL";
  };
  f3.forEach((S5, g5) => {
    S5.node.isGroup ? b4[g5].span = 1 / 0 : !S5.node.img && !S5.node.icon && (b4[g5].span = O4(S5.shape, S5.w, S5.h, p4(g5)));
  });
  let T5 = [], y6 = [], x5 = [];
  for (let S5 of h7.edges) {
    let g5 = G3.get(S5.start), L5 = G3.get(S5.end);
    if (g5 === void 0 || L5 === void 0) continue;
    let _5 = Tt(S5.label, S5.labelType === "markdown", m5, k4, C6);
    g5 === L5 && (f3[g5].loops++, p4(g5) ? b4[g5].h += 2 * (ve + (_5.height > 0 ? _5.height + 8 : 0)) : b4[g5].w += 2 * (ve + (_5.width > 0 ? _5.width + 12 : 0))), x5.push(S5), y6.push(_5), T5.push({ src: g5, dst: L5, minlen: S5.minlen ?? 1, labelW: _5.width > 0 ? _5.width + 12 : 0, labelH: _5.height > 0 ? _5.height + 4 : 0, route: [], labelX: 0, labelY: 0 });
  }
  let P4 = { nodeSep: Ue2(I5, "nodeSpacing", Jt2) * (A6 ? 0.5 : 1), edgeSep: Zt2, rankSep: Ue2(I5, "rankSpacing", en2) * (A6 ? 0.75 : 1), portSep: 20, tracks: typeof I5.curve == "string" && /^step/.test(I5.curve), straight: I5.curve === "linear", headRoom: wn("arrow_point") }, W3 = i5 ? i5.layout(b4, T5, d4, P4, A6) : me(b4, T5, d4, P4), v4 = Tt(o3.title, false, m5, D4, A6 ? h6(l4) : 4e3, 1), te = v4.height > 0 ? v4.height + 12 : 0, j4 = Math.max(W3.width, v4.width), q5 = N4 + (j4 - W3.width) / 2, oe = N4 + te;
  pe2(b4, T5, q5, oe);
  let a2 = Math.ceil(j4 + 2 * N4), t = Math.ceil(W3.height + te + 2 * N4), c3 = [], r2 = /* @__PURE__ */ new Map(), E6 = false;
  for (let S5 of b4) S5.isGroup && (E6 = true);
  if (E6) for (let S5 of T5) x3(r2, S5.route);
  let R5 = "", z4 = "", Y3 = "";
  for (let S5 = 0; S5 < f3.length; S5++) {
    let g5 = f3[S5], L5 = b4[S5], _5 = g5.node, J2 = L5.x, X2 = L5.y, F3 = bt2(_5.cssClasses.replace(/^default\s?/, "")), O5 = y3(_5.id);
    if (L5.isGroup && i5?.drawGroup && L5.parent < 0) {
      R5 += i5.drawGroup(L5, g5.label, g5.style, F3, O5, d4, w5);
      continue;
    }
    if (L5.isGroup) {
      let M6 = h3(L5, g5.label.width, r2, n2), V3 = X2 - L5.h / 2 + 8 + g5.label.height / 2, ne = ` class="pele-cluster-label" fill="var(--_m)"${g5.style.text}`, ee = y4(L5, g5.label.width, M6, r2);
      ee && (z4 += C4(g5.label, M6, V3, ne, O5, b4, S5, w5)), R5 += `<g class="pele-cluster${F3}" data-id="${O5}"><rect x="${m(J2 - L5.w / 2)}" y="${m(X2 - L5.h / 2)}" width="${m(L5.w)}" height="${m(L5.h)}" rx="${E3}" fill="var(--_a)" fill-opacity="0.5" stroke="var(--_b)"${g5.style.shape}/>` + (ee ? "" : gt2(g5.label, M6, V3, ne, w5)) + "</g>";
      continue;
    }
    let ie2 = g5.w, K3 = g5.h, Q2;
    if (_5.img) {
      let M6 = pe3(_5.assetWidth, 80), V3 = pe3(_5.assetHeight, 80), ne = g5.label.height > 0 ? _5.pos === "t" ? K3 / 2 - V3 : -K3 / 2 : -V3 / 2, ee = H2(A4(_5.img), l4);
      Q2 = ee === void 0 ? "" : `<image href="${$3(ee)}" x="${m(-M6 / 2)}" y="${m(ne)}" width="${m(M6)}" height="${m(V3)}" preserveAspectRatio="${_5.constraint === "on" ? "xMidYMid meet" : "none"}"/>`;
    } else if (_5.icon) {
      let M6 = pe3(_5.assetHeight, 48), V3 = g5.label.height > 0 ? _5.pos === "t" ? K3 / 2 - M6 : -K3 / 2 : -M6 / 2, ne = _5.shape === "icon" ? "" : _5.shape === "iconCircle" ? `<circle cy="${m(V3 + M6 / 2)}" r="${m(M6 / 2)}"${Fe2}${g5.style.shape}/>` : `<rect x="${m(-M6 / 2)}" y="${m(V3)}" width="${m(M6)}" height="${m(M6)}" rx="${_5.shape === "iconRounded" ? 8 : 0}"${Fe2}${g5.style.shape}/>`, ee = M6 * 0.6;
      Q2 = ne + `<svg class="pele-icon" data-icon="${y3(_5.icon)}" x="${m(-ee / 2)}" y="${m(V3 + (M6 - ee) / 2)}" width="${m(ee)}" height="${m(ee)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${w5?.(_5.icon) ?? ""}</svg>`;
    } else Q2 = E5(g5.shape, ie2, K3, Fe2 + g5.style.shape, tn2 + g5.style.line);
    let $4 = gt2(g5.label, 0, g5.dy, ` class="pele-label"${g5.style.text}`, w5);
    if (/ internal-link(?: |$)/.test(F3 + " ") && _5.label && l4.links !== false) {
      let M6 = $2(_5.label), V3 = M4(L4(M6), l4) !== void 0, ne = $3(M6);
      $4 = `<a class="internal-link"${V3 ? ` href="${ne}"${O3(l4)}` : ""} data-href="${ne}">${$4}</a>`, c3.push({ id: _5.id, href: M6, internal: true });
    }
    let H4 = Q2 + $4;
    _5.tooltip && (H4 = `<title>${y3(_5.tooltip)}</title>` + H4), _5.link && (H4 = N3(H4, _5.link, _5.id, c3, l4, _5.linkTarget ? ` target="${$3(_5.linkTarget)}"` : "")), Y3 += `<g class="pele-node pele-shape-${g5.shape}${F3}" data-id="${O5}" transform="translate(${m(J2)},${m(X2)})">${H4}</g>`;
  }
  let se3 = vn();
  for (let S5 = 0; S5 < T5.length; S5++) {
    let g5 = T5[S5];
    g5.src === g5.dst || x5[S5].thickness === "invisible" || g5.route.length < 6 || (se3.add(g5.src, R4(g5.route, 0, b4[g5.src]), x5[S5].arrowTypeStart), se3.add(g5.dst, R4(g5.route, g5.route.length - 3, b4[g5.dst]), x5[S5].arrowTypeEnd));
  }
  let Ae2 = "", me2 = "", Ge2 = /* @__PURE__ */ new Map();
  for (let S5 = 0; S5 < T5.length; S5++) {
    let g5 = T5[S5], L5 = x5[S5], _5 = y6[S5], J2 = L5.style.length > 0 || L5.cssCompiledStyles.length > 0 ? wt2(L5.cssCompiledStyles.concat(L5.style)) : void 0;
    if (L5.thickness !== "invisible") {
      let X2 = L5.arrowTypeStart, F3 = L5.arrowTypeEnd, O5;
      if (g5.src === g5.dst) {
        let $4 = f3[g5.src], Z4 = Ge2.get(g5.src) ?? 0;
        Ge2.set(g5.src, Z4 + 1), O5 = Ln(b4[g5.src], $4.w, $4.h, Z4, p4(g5.src), ve, wn(F3), g5);
      } else {
        let $4 = g5.route.slice(), Z4 = se3.of(g5.src, R4($4, 0, b4[g5.src])), H4 = se3.of(g5.dst, R4($4, $4.length - 3, b4[g5.dst]));
        B3($4, 0, f3[g5.src], b4[g5.src]), B3($4, $4.length - 3, f3[g5.dst], b4[g5.dst]), O5 = Fn($4, L5.curve, wn(X2), wn(F3), Z4, H4);
      }
      let ie2 = J2?.stroke && L5.thickness !== "invisible" ? $3(J2.stroke) : "var(--_l)", K3 = "";
      L5.thickness === "thick" ? K3 += ' stroke-width="2.5"' : L5.thickness === "dotted" && (K3 += ' stroke-dasharray="3 4"');
      let Q2 = bt2(L5.classes.replace(/edge-thickness-normal|edge-pattern-solid|flowchart-link/g, ""));
      Ae2 += `<g class="pele-edge${Q2}" data-id="${y3(L5.id)}"${J2?.line ?? ""}><path d="${O5.d}"${K3}/>` + Dn(X2, O5.sx, O5.sy, O5.sdx, O5.sdy, ie2) + Dn(F3, O5.ex, O5.ey, O5.edx, O5.edy, ie2) + "</g>";
    }
    if (_5.width > 0) {
      let X2 = g5.labelX, F3 = g5.labelY;
      me2 += Sn(L5.id, _5, X2, F3, J2?.text ?? "", w5);
    }
  }
  return { svg: _t2(i5?.type ?? "flowchart", a2, t, D4, l4, o3, gt2(v4, a2 / 2, N4 + v4.height / 2, ' class="pele-title" font-weight="var(--_tw)"') + (R5 ? `<g class="pele-clusters">${R5}</g>` : "") + (Ae2 ? `<g class="pele-edges" fill="none" stroke="var(--_l)" stroke-linecap="round">${Ae2}</g>` : "") + (z4 ? `<g class="pele-cluster-titles">${z4}</g>` : "") + (me2 ? `<g class="pele-edge-labels" font-size="${k4}">${me2}</g>` : "") + `<g class="pele-nodes">${Y3}</g>`), width: a2, height: t, links: c3 };
}
var Gn = { type: "flowchart", parse(o3, s3, l4, i5, u2) {
  let A6 = s3.flowchart ?? {}, n2 = new Ee({ inheritDir: A6.inheritDir === true, maxEdges: u2.maxEdges });
  return l4 && (n2.title = l4), _t4(o3, n2), n2;
}, render: yt2 };

// pele-flowchart.js
_t(Gn);
export {
  wt as render
};
