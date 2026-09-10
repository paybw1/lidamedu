// React 19 에서 `<style ref>` 의 ref 가 실제로 채워지는지 확인한다.
// (정리비교표 조절이 통째로 건너뛰어진 원인 가설 검증 — 추측으로 남기지 않는다.)
//   node scripts/digest/probe-style-ref.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const html = `<!doctype html><meta charset="utf-8"><div id="root"></div>
<script type="module">
  import React, { useEffect, useRef, useState } from "https://esm.sh/react@19";
  import { createRoot } from "https://esm.sh/react-dom@19/client";
  function App() {
    const s = useRef(null);
    const [msg, setMsg] = useState("…");
    useEffect(() => {
      const el = s.current;
      let applied = "?";
      if (el) {
        el.textContent = ".probe{font-size:7px}";
        applied = getComputedStyle(document.querySelector(".probe")).fontSize;
      }
      setMsg(JSON.stringify({
        ref: el ? el.tagName : null,
        부모: el?.parentElement?.tagName ?? null,
        적용된글자: applied,
        head에끌어올림: !!document.head.querySelector("style[data-probe]"),
      }));
      window.__result = msg;
    }, []);
    return React.createElement(React.Fragment, null,
      React.createElement("style", { ref: s, "data-probe": "1" }),
      React.createElement("div", { className: "probe" }, "가나다"),
      React.createElement("pre", { id: "out" }, msg),
    );
  }
  createRoot(document.getElementById("root")).render(React.createElement(App));
</script>`;

const file = "scripts/digest/.probe-style.html";
writeFileSync(file, html, "utf8");

const browser = await chromium.launch();
const p = await browser.newPage();
p.on("console", (m) => console.log("[브라우저]", m.text()));
await p.goto(`file:///${process.cwd().replace(/\\/g, "/")}/${file}`);
await p.waitForTimeout(2500);
console.log(await p.textContent("#out"));
await browser.close();
