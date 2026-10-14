# PPMS Action Items — User Guide

Action Items is a message window for **work instructions**. You tag the people
who must act with **@**, write what needs doing, and PPMS shows you who has
read it, who has accepted it and who has finished it. Applies to all modules
(F200-KD1, F200-KD2, F100-KD2).

## 1. Where to find it

A small blue **tab with an arrow (‹)** sticks out of the **right edge of the
screen, half-way down** (left edge when PPMS is in Arabic).

- When an action item **or a reply** arrives for you, the tab **flashes
  orange** and shows a **red number**. It keeps flashing until you open it.
- Click the tab to slide in the **Action Items sidebar** (full screen height).
  The page stays visible on the left.
- To close it: click the tab again (the arrow now points ›), press **✕** or
  **Esc**, or click anywhere on the page.
- The **?** button in the sidebar shows a short version of this guide.

## 2. Who can do what

| Role | Receive, acknowledge, mark done, reply | Send action items |
|---|---|---|
| Viewer | Yes | No |
| Operator | Yes | Yes |
| Planner | Yes | Yes |
| Master Admin | Yes | Yes |

## 3. Reading the sidebar

Action Items are shown as **cards**, oldest at the top and newest at the bottom,
grouped by day (Today, Yesterday, …). Each card has:

1. **Header** — who sent it, the time, **to** whom (the tags), and a red
   **URGENT** badge when urgent.
2. **The instruction.**
3. **Details** — 📅 due date (red **Overdue** when it has passed) and 🏷 what
   it is about (e.g. BTL-01 · K9 M3 · Hull).
4. **Replies** — “2 replies”; click to show or hide them.
5. **Footer** — the status on the left, the buttons on the right.

Cards you sent have a **blue left edge**; urgent ones a **red** one; a new card
has a blue glow.

Tabs at the top:

| Tab | Shows |
|---|---|
| **All** | Everything you sent or received |
| **To do** | Action Items sent to you that you have not marked done (orange count) |
| **Sent** | Action Items you sent (not shown to Viewers) |

## 4. Answering an action item sent to you

Opening the window marks your new action items as seen. The footer shows
**Waiting for you** until you answer:

| Button | Means | The sender sees |
|---|---|---|
| **✓ Acknowledge** | “I have read it and will do it.” | Acknowledged |
| **✓✓ Done** | “It is finished.” | Done |
| **↩ Reply** | Answer or ask a question (Enter sends). | Your reply on the card |
| **Undo** (after Done) | Marked done by mistake. | Back to Acknowledged |

**Urgent action items** appear in the middle of the screen as soon as they arrive
and stay there until you press **Acknowledge** (or **Open Action Items** to read
it in the window first).

## 5. Sending an action item (everyone except Viewers)

The box at the bottom of the window has three parts:

1. **To** — press **@ Add** and pick people or groups (search by typing). Each
   one becomes a chip; press **×** on a chip to remove it. You can also type
   **@** in the message — the person moves into the To row.

   | Choice | Who receives it |
   |---|---|
   | `@all` | Every active user (except you) |
   | `@admins` | All Master Admins |
   | `@planners` | All Planners |
   | `@operators` | All Operators |
   | `@viewers` | All Viewers |
   | A person | That person only |

   Under the To row you see how many people will receive it. Someone chosen
   twice receives it once.
2. **Message** — write the instruction.
3. **Toolbar** — **⚠ Urgent** (pops up on their screen until acknowledged —
   only for real stoppages), **📅 due date**, **🏷 About** (what it concerns),
   then **Send** (or **Ctrl+Enter**).

### Example

> To: **Omar Hassan**, **Youssef Samir**
> Hull welding on K9 M3 is 2 days late. Confirm the new finish date and record
> the delay reason.
> ⚠ Urgent · 📅 16 Oct · 🏷 BTL-01 · K9 M3 · Hull welding

## 6. Following up on what you sent

Under each of your action items there is a status line, for example
**1 of 3 done · 1 not opened**. It changes to **✓ All done**
when everyone has finished. Click the line to see each person and their
status. Everything updates live — no refresh needed — and the button flashes
when someone replies.

The **bin** button on your own cards (Withdraw) deletes an action item for
everyone it was sent to — use it for an action item sent by mistake.

## 7. Good practice

- One action item = one clear instruction: what, where and by when.
- Tag only the people who must act. Use `@all` for things everyone must know.
- Keep **Urgent** for real stoppages and safety issues, so people keep taking
  it seriously.
- Do **not** put passwords or confidential information in action items. Until the
  planned security upgrade (SC-01) is finished, PPMS data is not yet fully
  protected.

## 8. For the administrator

- Who can see Action Items is set in the local admin panel → **Action Items**:
  **Off**, **Pilot — Master Admins only**, or **Everyone**. Open PPMS sessions
  follow the change within seconds. During the pilot you can still tag anyone;
  they find those action items waiting when you switch it on for everyone.
- Database: `database/migrations/63_commands.sql` (tables `ppms_commands`,
  `ppms_command_recipients`, `ppms_command_replies`, `ppms_settings`). The
  button stays hidden until this migration has been run.
- Code: `app/scripts/features/commands/index.js`,
  `app/styles/features/commands.css` (mirrored in `app-v2/`).
- Deactivated users cannot be tagged. A user's `@name` comes from their email,
  so changing someone's email changes their tag.
