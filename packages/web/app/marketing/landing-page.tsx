import { useState } from "react";
import { href } from "react-router";

import { Link } from "~/components/link";

import { examples } from "./example-splits";
import { SharesExample } from "./shares-example";
import { SplitExample } from "./split-example";

const shareFeatures = [
  {
    title: "Shares",
    description:
      "Give a couple two shares, or a kid half a share. Any weight works, decimals included.",
  },
  {
    title: "Adjustments",
    description:
      "Add the bottle of wine to one person, or take off the dessert someone skipped. Adjustments apply first, and the rest is split by shares.",
  },
  {
    title: "Calculations",
    description:
      "Tap = in any amount field and type the sum straight from the receipt. Tasan works it out exactly and rounds only once, at the end.",
  },
];

const steps = [
  {
    title: "Bring your people.",
    description:
      "Create a split for your trip, dinner, or everyday expenses. Invite your friends with a link.",
  },
  {
    title: "Spend in your currency.",
    description:
      "Add expenses in the currency you paid and split them evenly or by shares. Tasan converts them to your split’s home currency.",
  },
  {
    title: "Settle up simply.",
    description:
      "Follow the simplified repayment plan, then record payments as you settle up with your friends.",
  },
];

function ArrowRight() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  );
}

const startLinkClasses =
  "inline-flex min-h-12 items-center justify-center gap-8 rounded-lg bg-brand-700 px-6 py-3 font-semibold text-white outline-brand-700 transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-4 dark:bg-brand-300 dark:text-brand-950 dark:outline-brand-300 dark:hover:bg-brand-200";

export const LandingPage = () => {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];

  return (
    <div>
      <section
        aria-labelledby="landing-heading"
        className="grid items-center gap-12 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:pt-20 lg:pb-24"
      >
        <div>
          <p className="text-brand-700 dark:text-brand-300 mb-6 text-xs font-semibold tracking-[0.18em] uppercase">
            Multiple currencies. Simpler repayments.
          </p>
          <h1
            id="landing-heading"
            className="text-brand-950 dark:text-brand-50 text-[clamp(2.75rem,15vw,3.75rem)] leading-[1.04] font-semibold tracking-[-0.055em] sm:text-7xl lg:text-[5.5rem]"
          >
            Good times.
            <br />
            <span className="text-brand-700 dark:text-brand-300 font-serif font-normal tracking-[-0.05em] italic">
              All square.
            </span>
          </h1>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-gray-700 dark:text-gray-200">
            Split bills across currencies, evenly or by shares. Tasan handles
            the conversions and simplifies who pays whom, so settling up takes
            less back-and-forth.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-5">
            <Link
              to={href("/splits/new")}
              variant="plain"
              className={startLinkClasses}
            >
              Start a split <ArrowRight />
            </Link>
            <a
              href="#how-it-works"
              className="text-brand-700 outline-brand-700 dark:text-brand-300 dark:outline-brand-300 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              How it works <span aria-hidden="true">↘</span>
            </a>
          </div>
        </div>

        <div className="bg-brand-100/70 dark:bg-brand-950 -mx-4 min-w-0 rounded-3xl p-4 min-[380px]:mx-0 sm:p-7">
          <div
            role="group"
            aria-label="Choose an example split"
            className="bg-brand-canvas/80 dark:bg-brand-950/90 mb-5 grid grid-cols-3 gap-1 rounded-xl p-1"
          >
            {examples.map((item, index) => (
              <button
                key={item.name}
                type="button"
                aria-pressed={selected === index}
                aria-controls="split-example"
                onClick={() => {
                  setSelected(index);
                }}
                className="text-brand-800 outline-brand-700 aria-pressed:bg-brand-700 dark:text-brand-100 dark:outline-brand-300 dark:hover:bg-brand-800 dark:aria-pressed:bg-brand-300 dark:aria-pressed:text-brand-950 min-h-11 cursor-pointer rounded-lg px-1 py-2 text-xs font-medium transition-colors hover:bg-white/60 focus-visible:outline-2 aria-pressed:text-white sm:text-sm"
              >
                {item.name}
              </button>
            ))}
          </div>
          <p
            id="example-description"
            className="text-brand-800 dark:text-brand-200 mb-3 text-center text-xs leading-relaxed"
          >
            Example split · Scroll to explore
          </p>
          <p role="status" className="sr-only">
            Showing {example.name}
          </p>
          <div
            key={example.name}
            id="split-example"
            role="region"
            aria-label={`${example.name} example split`}
            aria-describedby="example-description"
            tabIndex={0}
            className="bg-brand-canvas outline-brand-700 dark:outline-brand-300 max-h-144 overflow-y-auto overscroll-y-contain rounded-lg border border-gray-200 p-4 text-base focus-visible:outline-2 focus-visible:outline-offset-4 sm:p-6 dark:border-gray-700 dark:bg-gray-950"
          >
            <SplitExample example={example} />
          </div>
          <p className="text-brand-800 dark:text-brand-200 mt-4 text-center text-xs leading-relaxed">
            {example.caption}
          </p>
        </div>
      </section>

      <section
        aria-label="Less work, from spending to settling"
        className="border-brand-700/20 dark:border-brand-300/20 grid gap-10 border-t py-12 sm:grid-cols-2 sm:gap-16 sm:py-16"
      >
        <div>
          <p className="text-brand-700 dark:text-brand-300 text-xs font-semibold tracking-widest uppercase">
            Automatic currency conversion
          </p>
          <h2 className="text-brand-950 dark:text-brand-50 mt-4 text-3xl font-semibold tracking-tight">
            Different currencies.
            <br />
            One shared total.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            Someone booked in pounds. Someone paid in euros. Add each expense in
            its original currency and Tasan brings it all together in your
            split’s home currency. No looking up exchange rates yourself.
          </p>
        </div>
        <div>
          <p className="text-brand-700 dark:text-brand-300 text-xs font-semibold tracking-widest uppercase">
            Simplified repayments
          </p>
          <h2 className="text-brand-950 dark:text-brand-50 mt-4 text-3xl font-semibold tracking-tight">
            Fewer payments.
            <br />
            Same fair shares.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            Skip paying back every expense separately. Tasan combines everyone’s
            balances into a simple plan for who pays whom. You might pay a
            different person, but everyone ends up square.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="shares-heading"
        className="border-brand-700/20 dark:border-brand-300/20 grid items-center gap-10 border-t py-12 sm:py-16 lg:grid-cols-[1fr_1fr] lg:gap-16"
      >
        <div>
          <p className="text-brand-700 dark:text-brand-300 text-xs font-semibold tracking-widest uppercase">
            Shares, adjustments & calculations
          </p>
          <h2
            id="shares-heading"
            className="text-brand-950 dark:text-brand-50 mt-4 text-3xl font-semibold tracking-tight"
          >
            Not every split is even.
            <br />
            Every cent still adds up.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            Split equally, by exact amounts, or by shares. Tasan does the math
            and makes sure everyone’s part adds up to the total.
          </p>
          <dl className="mt-8 grid max-w-md gap-6">
            {shareFeatures.map((feature) => (
              <div
                key={feature.title}
                className="border-brand-700 dark:border-brand-300 border-l-2 pl-4"
              >
                <dt className="text-brand-950 dark:text-brand-50 font-semibold">
                  {feature.title}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                  {feature.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="bg-brand-100/70 dark:bg-brand-950 -mx-4 min-w-0 rounded-3xl p-4 min-[380px]:mx-0 sm:p-7">
          <div className="bg-brand-canvas rounded-lg border border-gray-200 p-4 sm:p-6 dark:border-gray-700 dark:bg-gray-950">
            <SharesExample />
          </div>
          <p className="text-brand-800 dark:text-brand-200 mt-4 text-center text-xs leading-relaxed">
            Example expense split by shares and adjustments.
          </p>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-heading"
        className="border-brand-700/20 dark:border-brand-300/20 scroll-mt-8 border-t py-12 sm:py-16"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="how-heading"
            className="text-brand-950 dark:text-brand-50 text-3xl font-semibold tracking-tight"
          >
            From “I’ll get this” to all settled.
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Three steps. Everyone on the same page.
          </p>
        </div>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-10">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="text-brand-700 dark:text-brand-300 font-mono text-sm">
                0{index + 1} /
              </span>
              <h3 className="text-brand-950 dark:text-brand-50 mt-3 text-lg font-semibold">
                {step.title}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="start-heading"
        className="bg-brand-100/70 dark:bg-brand-950 flex flex-col items-start justify-between gap-6 rounded-2xl p-7 sm:flex-row sm:items-center sm:p-9"
      >
        <div>
          <h2
            id="start-heading"
            className="text-brand-950 dark:text-brand-50 text-2xl font-semibold tracking-tight"
          >
            Your next good time starts here.
          </h2>
          <p className="text-brand-800 dark:text-brand-200 mt-2 text-sm">
            One split for whatever you have planned.
          </p>
        </div>
        <Link
          to={href("/splits/new")}
          variant="plain"
          className={`${startLinkClasses} shrink-0`}
        >
          Start a split <ArrowRight />
        </Link>
      </section>
    </div>
  );
};
