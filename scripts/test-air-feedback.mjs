/** Render actual feedback atoms in rare download/retry/ready states, without fetching models.
 * Complements real editor journeys; this does not test model inference. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(resolve(root, ".air-feedback-"));
const output = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-air-feedback";
await mkdir(output, { recursive: true });
let server, browser;
try {
  await writeFile(
    resolve(temp, "index.html"),
    '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="./main.jsx"></script></body></html>',
  );
  await writeFile(
    resolve(temp, "main.jsx"),
    `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../src/tokens.css';
import '../src/style.css';
import {CapabilityProgressCard, CapabilityErrorCard} from '../src/editor/ai/ui/status/CapabilityStatusCards';
import {DetectionProgressCard, DetectionReadyChip, DetectionPausedChip, DetectionErrorCard} from '../src/editor/ai/ui/DetectionStatus';
import {MaskReadyPill} from '../src/editor/ai/ui/MaskReadyPill';
import {SmartActionError} from '../src/editor/ai/ui/SmartActionError';
function Fixture(){
 const [dismissed,setDismissed]=useState(false),[actions,setActions]=useState(0);
 const act=()=>setActions(n=>n+1);
 const progress={phase:'download',ratio:0.42,bytesTotal:84000000,bytesDownloaded:35280000,label:'Downloading model…'};
 const copy={inProgressLabel:'Working on this device…',connectingLabel:'Connecting…'};
 return <main style={{maxWidth:340,margin:'24px auto',padding:16,display:'grid',gap:20}}>
 <h1 style={{fontSize:20}}>Feedback states</h1>
 <CapabilityProgressCard progress={progress} warm={false} copy={copy} onCancel={act}/>
 <CapabilityProgressCard progress={{phase:'download',ratio:0,label:'Preparing model…'}} warm={false} copy={copy} onCancel={act}/>
 <CapabilityProgressCard progress={{phase:'inference',ratio:0}} warm copy={copy} onCancel={act}/>
 <CapabilityErrorCard msg="The model could not be downloaded. Check your connection and try again." onRetry={act}/>
 <DetectionProgressCard progress={progress} warm={false} onCancel={act}/>
 <DetectionErrorCard msg="Detection could not finish. Your original image is unchanged." onRetry={act}/>
 <DetectionReadyChip/><DetectionPausedChip onResume={act}/><MaskReadyPill ready/>
 <SmartActionError message={dismissed ? null : 'This action could not finish. Try again.'} onDismiss={()=>setDismissed(true)}/>
 <output aria-label="Fixture actions">{actions}</output>
 </main>;
}
createRoot(document.getElementById('app')).render(<Fixture/>);
`,
  );
  server = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const results = [],
    errors = [];
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1280, 720],
    [1440, 900],
  ])
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height },
        colorScheme: theme,
        reducedMotion: "reduce",
        hasTouch: width < 1100,
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:" + port + "/" + basename(temp) + "/index.html");
      await page.getByRole("heading", { name: "Feedback states" }).waitFor();
      const geometry = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            ".air-radius-panel,.air-radius-chip,.air-radius-control,.air-button,.air-icon-button",
          ),
        ].map((e) => {
          const style = getComputedStyle(e),
            expected = e.classList.contains("air-radius-panel")
              ? "18px"
              : e.classList.contains("air-radius-chip")
                ? "8px"
                : "10px";
          return {
            class: e.className,
            expected,
            corners: [
              style.borderTopLeftRadius,
              style.borderTopRightRadius,
              style.borderBottomRightRadius,
              style.borderBottomLeftRadius,
            ],
          };
        }),
      );
      assert.ok(geometry.length >= 12);
      assert.equal(await page.getByRole("status", { name: "Subject mask ready" }).count(), 1);
      const targets = await page.locator("button").evaluateAll((elements) =>
        elements.map((e) => ({
          width: e.getBoundingClientRect().width,
          height: e.getBoundingClientRect().height,
          minimum: matchMedia("(pointer: coarse)").matches ? 44 : 32,
        })),
      );
      assert.ok(targets.every((t) => t.width >= t.minimum && t.height >= t.minimum));
      for (const item of geometry) assert.deepEqual(item.corners, Array(4).fill(item.expected));
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({
        path: resolve(output, width + "-" + theme + ".png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Dismiss error" }).click();
      assert.equal(await page.getByText("This action could not finish. Try again.").count(), 0);
      await page.getByRole("button", { name: "Try again" }).first().click();
      assert.equal(await page.getByLabel("Fixture actions").textContent(), "1");
      results.push({ width, height, theme, geometry });
      await page.close();
    }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify({ results, errors }, null, 2) + "\n",
  );
  console.log("10 real-component feedback layouts; all corner, overflow and callback checks pass.");
} finally {
  await browser?.close();
  await server?.close();
  await rm(temp, { recursive: true, force: true });
}
