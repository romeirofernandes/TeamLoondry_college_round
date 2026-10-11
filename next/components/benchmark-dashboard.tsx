"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  ChartBar,
  CheckCircle,
  Clock,
  Globe,
  Info,
  MagnifyingGlass,
  Microphone,
  Mouse,
  PauseCircle,
  WarningCircle,
  YoutubeLogo,
} from "@phosphor-icons/react";
import BrandLogo from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

type Benchmark = {
  name: string;
  shortName: string;
  manual: number;
  handsfree: number;
  errors: number | null;
  icon: typeof Globe;
  workflow?: string;
  observation: string;
  issue?: string;
};

const benchmarks: Benchmark[] = [
  {
    name: "Wikipedia navigation",
    shortName: "Wikipedia",
    manual: 55,
    handsfree: 50,
    errors: 3,
    icon: Globe,
    observation: "Voice commands were occasionally not recognized correctly, but navigation and finding the Notes section were faster.",
  },
  {
    name: "Amazon product search",
    shortName: "Amazon search",
    manual: 60,
    handsfree: 90,
    errors: 6,
    icon: MagnifyingGlass,
    workflow: "Search for a mouse, filter for ₹1,000–₹3,000, select a product, and open customer reviews.",
    observation: "Speaking product names accurately was difficult, although navigation felt faster.",
  },
  {
    name: "YouTube playback",
    shortName: "YouTube playback",
    manual: 25,
    handsfree: 32,
    errors: null,
    icon: YoutubeLogo,
    issue: "Wrong video selected due to a pronunciation-related recognition problem.",
    observation: "Pause and resume controls were convenient.",
  },
];

const totalManual = benchmarks.reduce((sum, item) => sum + item.manual, 0);
const totalHandsfree = benchmarks.reduce((sum, item) => sum + item.handsfree, 0);
const difference = (handsfree: number, manual: number) =>
  ((handsfree - manual) / manual) * 100;
const totalDifference = difference(totalHandsfree, totalManual);
const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

function PerformanceChart() {
  const max = 100;
  return (
    <div className="benchmark-chart-wrap">
      <div className="benchmark-legend" aria-label="Chart legend">
        <span><i className="legend-manual" />Manual</span>
        <span><i className="legend-handsfree" />Handsfree</span>
        <small>Completion time (seconds)</small>
      </div>
      <div className="benchmark-group-chart" role="img" aria-label="Grouped bar chart showing task completion time in seconds: Wikipedia 55 manual and 50 Handsfree; Amazon search 60 manual and 90 Handsfree; YouTube playback 25 manual and 32 Handsfree.">
        <div className="benchmark-y-axis" aria-hidden="true"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
        <div className="benchmark-chart-plot">
          {benchmarks.map((task) => (
            <div className="benchmark-bar-group" key={task.name}>
              <div className="benchmark-bars">
                <div className="benchmark-bar manual" style={{ height: `${(task.manual / max) * 100}%` }} tabIndex={0} aria-label={`${task.name}, Manual: ${task.manual} seconds`}><span>{task.manual}s</span><b /></div>
                <div className="benchmark-bar handsfree" style={{ height: `${(task.handsfree / max) * 100}%` }} tabIndex={0} aria-label={`${task.name}, Handsfree: ${task.handsfree} seconds`}><span>{task.handsfree}s</span><b /></div>
              </div>
              <p>{task.shortName}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="benchmark-caption"><strong>Wikipedia was the one faster voice-controlled task.</strong> Search and playback took longer when recognition required recovery or a precise query.</p>
    </div>
  );
}

export function BenchmarkDashboard() {
  return (
    <div className="benchmark-page">
      <header className="benchmark-header">
        <BrandLogo href="/" />
        <div className="benchmark-header-actions">
          <a href="/dashboard" className="benchmark-back"><ArrowLeft />Dashboard</a>
          <ThemeToggle />
        </div>
      </header>
      <main className="benchmark-main">
        <section className="benchmark-intro" aria-labelledby="benchmark-title">
          <div>
            <div className="benchmark-kickers"><span className="benchmark-status"><i />Preliminary results</span><span>3 tasks evaluated</span></div>
            <h1 id="benchmark-title">Benchmark &amp; <span>Performance</span></h1>
            <p>Compare voice-controlled browsing with traditional browser interaction.</p>
          </div>
          <Button asChild variant="outline"><a href="#methodology">View methodology <ArrowUpRight data-icon="inline-end" /></a></Button>
        </section>

        <section className="benchmark-kpis" aria-label="Benchmark overview">
          <article><Clock /><p>Total manual time</p><strong>{totalManual} <small>sec</small></strong><span>Across three recorded tasks</span></article>
          <article><Microphone /><p>Total Handsfree time</p><strong>{totalHandsfree} <small>sec</small></strong><span>Across the same three tasks</span></article>
          <article className="benchmark-kpi-caution"><WarningCircle /><p>Overall time difference</p><strong>{pct(totalDifference)}</strong><span>Handsfree took longer overall</span></article>
          <article className="benchmark-kpi-positive"><ChartBar /><p>Fastest Handsfree task</p><strong className="benchmark-task-value">Wikipedia navigation</strong><span>5 seconds faster than manual</span></article>
        </section>

        <section className="benchmark-panel benchmark-performance" aria-labelledby="performance-heading">
          <div className="benchmark-panel-heading"><div><p className="benchmark-overline">Task completion</p><h2 id="performance-heading">Performance by task</h2></div><span className="benchmark-unit">Seconds · lower is better</span></div>
          <PerformanceChart />
        </section>

        <section className="benchmark-section" aria-labelledby="comparison-heading">
          <div className="benchmark-section-heading"><div><p className="benchmark-overline">Recorded trials</p><h2 id="comparison-heading">Task-by-task comparison</h2></div><p>One recorded trial per method, per task.</p></div>
          <div className="benchmark-task-grid">
            {benchmarks.map((task) => {
              const Icon = task.icon;
              const delta = difference(task.handsfree, task.manual);
              const faster = delta < 0;
              return <article className="benchmark-task-card" key={task.name}>
                <div className="benchmark-task-top"><span className="benchmark-task-icon"><Icon weight="duotone" /></span><span className={`benchmark-result ${faster ? "faster" : "slower"}`}>{faster ? `${Math.abs(delta).toFixed(1)}% faster` : `${delta.toFixed(0)}% slower`}</span></div>
                <h3>{task.name}</h3>
                <div className="benchmark-timing"><div><span><Mouse /> Manual</span><strong>{task.manual}<small>s</small></strong></div><div><span><Microphone /> Handsfree</span><strong>{task.handsfree}<small>s</small></strong></div></div>
                <div className="benchmark-mini-bars" aria-label={`Manual ${task.manual} seconds; Handsfree ${task.handsfree} seconds`}><i style={{ width: `${task.manual / 90 * 100}%` }} /><b style={{ width: `${task.handsfree / 90 * 100}%` }} /></div>
                <div className="benchmark-task-notes">
                  <p><strong>{task.errors === null ? "Errors" : "Reported Handsfree errors"}</strong>{task.errors === null ? "Not recorded" : `${task.errors} · Both methods succeeded`}</p>
                  {task.workflow && <p><strong>Workflow</strong>{task.workflow}</p>}
                  {task.issue && <p><strong>Reported issue</strong>{task.issue}</p>}
                  <p><strong>Observation</strong>{task.observation}</p>
                </div>
              </article>;
            })}
          </div>
        </section>

        <section className="benchmark-analysis-grid">
          <article className="benchmark-panel benchmark-total" aria-labelledby="total-heading"><div className="benchmark-panel-heading"><div><p className="benchmark-overline">All recorded tasks</p><h2 id="total-heading">Total time comparison</h2></div></div><div className="benchmark-total-bars"><div><span>Manual <strong>{totalManual}s</strong></span><i style={{ width: `${totalManual / totalHandsfree * 100}%` }} /></div><div><span>Handsfree <strong>{totalHandsfree}s</strong></span><i style={{ width: "100%" }} /></div></div><p><strong>32 seconds longer</strong> · Handsfree took {totalDifference.toFixed(1)}% longer across the sum of the three recorded tasks.</p></article>
          <article className="benchmark-panel benchmark-errors" aria-labelledby="errors-heading"><div className="benchmark-panel-heading"><div><p className="benchmark-overline">Recognition friction</p><h2 id="errors-heading">Reported Handsfree errors</h2></div></div><div className="benchmark-error-list">{benchmarks.map((task) => <div key={task.name}><span>{task.shortName}</span>{task.errors === null ? <em>Not recorded</em> : <><i><b style={{ width: `${task.errors / 6 * 100}%` }} /></i><strong>{task.errors}</strong></>}</div>)}</div><p>Speech recognition and pronunciation were recurring issues in the recorded observations.</p></article>
        </section>

        <section className="benchmark-insights" aria-labelledby="insights-heading"><div><p className="benchmark-overline">What the data suggests</p><h2 id="insights-heading">Key insights</h2></div><div className="benchmark-insight-list"><article><CheckCircle /><div><h3>Navigation advantage</h3><p>Handsfree completed Wikipedia 5 seconds faster, despite three reported errors.</p></div></article><article><MagnifyingGlass /><div><h3>Search remains challenging</h3><p>Accurate pronunciation of product names and song titles introduced friction in search-heavy workflows.</p></div></article><article><PauseCircle /><div><h3>Media controls show promise</h3><p>Pausing and resuming playback was convenient, even though the complete YouTube task took longer.</p></div></article></div></section>

        <section className="benchmark-roadmap" aria-labelledby="roadmap-heading"><div><p className="benchmark-overline">Next iteration</p><h2 id="roadmap-heading">Improvement roadmap</h2></div><ol><li><b>01</b><div><h3>Improve recognition accuracy</h3><p>Better handling of product names, song titles, and specific search queries.</p></div></li><li><b>02</b><div><h3>Reduce recovery time</h3><p>Make missed commands and incorrect selections easier to correct.</p></div></li><li><b>03</b><div><h3>Benchmark common controls separately</h3><p>Test navigation, scrolling, pause, and resume independently from search.</p></div></li></ol></section>

        <details className="benchmark-methodology" id="methodology"><summary><span><Info /> Methodology &amp; limitations</span><span>Open details</span></summary><div><p>Manual means mouse-and-keyboard interaction. Handsfree means voice-controlled interaction. Completion times are measured in seconds and percentage difference is calculated relative to manual time.</p><p><code>Time difference (%) = ((Handsfree time − Manual time) / Manual time) × 100</code></p><p>A negative time difference means Handsfree was faster; a positive difference means it was slower. This report has one recorded trial per method for each task, so results are preliminary and do not establish statistical significance. Repeated trials are required for more reliable conclusions.</p></div></details>
      </main>
      <footer className="benchmark-footer"><p>Handsfree benchmark report · preliminary recorded results</p><a href="/dashboard">Return to dashboard <ArrowUpRight /></a></footer>
    </div>
  );
}
