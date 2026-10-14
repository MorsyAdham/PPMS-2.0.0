# PPMS Commands — User Guide

Commands is a message window for **work instructions**. You tag the people
who must act with **@**, write what needs doing, and PPMS shows you who has
read it, who has accepted it and who has finished it. Applies to all modules
(F200-KD1, F200-KD2, F100-KD2).

## 1. Where to find it

A blue **Commands** button sits at the **top right**, just under the top bar
(the twin of the **Ask PPMS** button at the bottom left).

- When a command **or a reply** arrives for you, the button **flashes orange**
  and shows a **red number**. It keeps flashing until you open it.
- Click it to open the Commands window. Click it again, press **✕** or **Esc**
  to close it.
- The **?** button in the window shows a short version of this guide.

## 2. Who can do what

| Role | Receive, acknowledge, mark done, reply | Send commands |
|---|---|---|
| Viewer | Yes | No |
| Operator | Yes | Yes |
| Planner | Yes | Yes |
| Master Admin | Yes | Yes |

## 3. Reading the window

The window works like a chat:

- **Oldest at the top, newest at the bottom**, grouped by day (Today,
  Yesterday, …).
- Commands from **others are on the left** with their initials. **Your own are
  on the right** in blue.
- A command with a **blue outline** is new. A **red left edge** means Urgent.
- Under a command you may see: **URGENT**, **due 16 Oct** (red when the date
  has passed) and **↗ what it is about** (e.g. BTL-01 · K9 M3 · Hull).
- Replies appear indented under the command.

Filters at the top:

| Filter | Shows |
|---|---|
| **All** | Everything you sent or received |
| **To do** | Commands sent to you that you have not marked done |
| **Sent** | Commands you sent (not shown to Viewers) |

## 4. Answering a command sent to you

Opening the window marks your new commands as **Seen**. Then, under the
command:

| Button | Means | The sender sees |
|---|---|---|
| **Acknowledge** | “I have read it and will do it.” | Acknowledged |
| **Done** | “It is finished.” | Done |
| **Reply** | Answer or ask a question (Enter sends). | Your reply under the command |
| **undo** (after Done) | Marked done by mistake. | Back to Acknowledged |

**Urgent commands** appear in the middle of the screen as soon as they arrive
and stay there until you press **Acknowledge** (or **Open Commands** to read
it in the window first).

## 5. Sending a command (everyone except Viewers)

1. Open the window. The message box is at the bottom.
2. Press **@ Tag people** under the box (or type **@**) and choose who must act. Keep typing to filter, use ↑ ↓ to move,
   and **Enter** or **Tab** to choose. You can tag several people or groups.

   | Tag | Who receives it |
   |---|---|
   | `@all` | Every active user (except you) |
   | `@admins` | All Master Admins |
   | `@planners` | All Planners |
   | `@operators` | All Operators |
   | `@viewers` | All Viewers |
   | `@name.surname` | One person — the part of their email before the @ |

3. Check the line above the box. It shows exactly how many people will receive
   it and who they are. Someone tagged twice receives it once.
4. Write the instruction after the tags.
5. Optional, under the box:
   - **Urgent** — pops up on their screen until they acknowledge. Use it only
     when work must stop or change now.
   - **More** → **Due** (the date it must be finished) and **About** (what it
     concerns, e.g. `BTL-01 · K9 M3 · Hull welding`).
6. Press the **blue arrow** (or **Ctrl+Enter**).

### Example

> `@omar.hassan @youssef.samir` Hull welding on K9 M3 is 2 days late. Confirm
> the new finish date and record the delay reason.
> Urgent · Due 16 Oct · About: BTL-01 · K9 M3 · Hull welding

## 6. Following up on what you sent

Under each of your commands there is a status line, for example
**1 of 3 done · 1 not opened yet**. It changes to **✓ All done**
when everyone has finished. Click the line to see each person and their
status. Everything updates live — no refresh needed — and the button flashes
when someone replies.

**Withdraw** deletes a command for everyone it was sent to — use it for a
command sent by mistake.

## 7. Good practice

- One command = one clear instruction: what, where and by when.
- Tag only the people who must act. Use `@all` for things everyone must know.
- Keep **Urgent** for real stoppages and safety issues, so people keep taking
  it seriously.
- Do **not** put passwords or confidential information in commands. Until the
  planned security upgrade (SC-01) is finished, PPMS data is not yet fully
  protected.

## 8. For the administrator

- Who can see Commands is set in the local admin panel → **Commands**:
  **Off**, **Pilot — Master Admins only**, or **Everyone**. Open PPMS sessions
  follow the change within seconds. During the pilot you can still tag anyone;
  they find those commands waiting when you switch it on for everyone.
- Database: `database/migrations/63_commands.sql` (tables `ppms_commands`,
  `ppms_command_recipients`, `ppms_command_replies`, `ppms_settings`). The
  button stays hidden until this migration has been run.
- Code: `app/scripts/features/commands/index.js`,
  `app/styles/features/commands.css` (mirrored in `app-v2/`).
- Deactivated users cannot be tagged. A user's `@name` comes from their email,
  so changing someone's email changes their tag.
