# How to use Clawdacademy (the AI Fluency Trainer)

Clawdacademy is a free Claude Code plugin that scores how well you actually use
AI, from your real coding sessions, and shows you exactly where to improve. Here
is how to get it running and read your results.

## 1. Install (about 2 minutes)

Prerequisites: `python3` (3.8+) and `node`. The installer checks for both and
tells you clearly if either is missing, it will not silently do nothing.

In Claude Code:

```
/plugin marketplace add jddavenportOpen/ai-fluency-trainer
/plugin install ai-fluency@ai-fluency
```

Or one line in your terminal:

```
curl -fsSL https://clawdacademy.app/install.sh | bash
```

This installs the plugin, wires up the capture hooks, and claims you a handle.

## 2. Just work

Use Claude Code the way you normally do. The plugin runs quietly in the
background and scores each turn on the seven behaviors that separate people who
get smarter with AI from people who get passively dumber:

- **Context Setting** - giving Claude what it needs to succeed
- **Plan First** - making it plan before it builds
- **Verification** - checking the work (running tests, reading the diff)
- **Diagnose vs Retry** - inspecting a failure instead of blindly re-running
- **Understanding Seeking** - learning, not just accepting
- **Scope Discipline** - one clear deliverable, not a kitchen sink
- **Iteration Discipline** - scrutinizing and refining

A statusline shows your live Fluency Rating, and a coach nudges you when you are
about to do something that would lower it. Scoring is on your real behavior, not
on whether you typed the magic words, running the test counts as verification
even if you never say "verify."

## 3. See your score

Your public profile lives at `https://clawdacademy.app/u/<your-handle>`:

- Your **Fluency Rating** (0-100 plus a band). It is volume-independent, so you
  cannot grind your way up. The only way the number moves is getting better.
- A **seven-dimension radar** of how you work.
- Your **strengths**, and, when you are logged into your own profile, specific
  coaching on **where you need work**.

## 4. The leaderboard

`https://clawdacademy.app/leaderboard` ranks everyone by quality and is sortable
and filterable. See where you stand and who is climbing.

## 5. Your data stays yours

Local-first by design. Your prompts and your code never leave your machine. Only
aggregate numeric scores sync, and only if you opt in (a token in your config).
Turn syncing off any time and the local coach still works.

## Troubleshooting

- **No score showing up?** Confirm `python3` and `node` are installed, the plugin
  needs both. On a fresh machine that is the usual cause.
- **Rating says "provisional"?** It firms up after about 15 scored turns.
- **Statusline missing?** Restart Claude Code once after installing.
- **Wrong handle or want to reset?** Re-run the installer, or claim a handle at
  `https://clawdacademy.app/start`.

## The short version

Install it, work normally, check your profile. It tells you the truth about how
you use AI and coaches you toward the habits that make you smarter with it.
