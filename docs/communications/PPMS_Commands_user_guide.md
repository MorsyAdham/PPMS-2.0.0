# PPMS Commands — User Guide

Commands let Master Admins and Planners send instructions to people directly
inside PPMS, and see who has read them and who has finished them. Applies to
all modules (F200-KD1, F200-KD2, F100-KD2).

## 1. Where to find it

A **speech-bubble button** sits in the top bar, next to the version number.

- A **red number** on it shows how many new commands you have not opened yet.
- Click it to open the **Commands panel** on the right. The page underneath
  stays visible, so you can check the plan while you read.
- The **?** button in the panel shows a short version of this guide.

## 2. Who can do what

| Role | Receive, acknowledge, mark done, reply | Send commands |
|---|---|---|
| Viewer | Yes | No |
| Operator | Yes | No |
| Planner | Yes | Yes |
| Master Admin | Yes | Yes |

## 3. Receiving a command

1. A small message appears in the corner, and the red number goes up.
2. Open the Commands panel. Opening it marks your new commands as **Seen**.
3. Press one of the buttons on the command:

| Button | Means | The sender sees |
|---|---|---|
| **Acknowledge** | “I have read it and will do it.” | Acknowledged |
| **Mark done** | “It is finished.” | Done |
| **Reply** | Answer or ask a question. | Your reply under the command |
| **undo** (after Done) | Marked done by mistake. | Back to Acknowledged |

**Urgent commands** appear in the middle of the screen as soon as they arrive
and stay there until you press **Acknowledge** (or **Open Commands** to read
it in the panel first).

The panel has two tabs:

- **Inbox** — every command sent to you.
- **To do** — the ones you have not marked done yet.

A due date shown in **red** has passed.

## 4. Sending a command (Master Admin and Planner)

1. Open the Commands panel. The message box is at the bottom.
2. Type **@** and choose who should receive it. Keep typing to filter the
   list, use ↑ ↓ to move, and **Enter** or **Tab** to choose. You can tag
   several people or groups in one command.

   | Tag | Who receives it |
   |---|---|
   | `@all` | Every active user (except you) |
   | `@admins` | All Master Admins |
   | `@planners` | All Planners |
   | `@operators` | All Operators |
   | `@viewers` | All Viewers |
   | `@name.surname` | One person — the part of their email before the @ |

3. Check the **To:** line above the box. It shows exactly how many people
   will receive the command and who they are. People tagged twice (for
   example by name and by `@all`) receive it once.
4. Write the instruction after the tags.
5. Optional:
   - **Priority — Urgent**: pops up on their screen until they acknowledge.
     Use it only when work must stop or change now.
   - **Due**: the date it must be finished.
   - **About**: what it concerns, e.g. `BTL-01 · K9 M3 · Hull welding`.
6. Press **Send** (or **Ctrl+Enter**).

### Example

> `@omar.hassan @youssef.samir` Hull welding on K9 M3 is 2 days late. Confirm
> the new finish date and record the delay reason.
> Priority: Urgent · Due: 16 Oct · About: BTL-01 · K9 M3 · Hull welding

## 5. Following up on what you sent

Open the **Sent** tab. Under each command you see four counts:

**done · acknowledged · seen · not opened**

Click the counts to see each person and their status. Everything updates live,
so you can watch people acknowledge without refreshing. Replies appear under
the command, and you get a small message when someone replies.

**Withdraw** deletes a command for everyone it was sent to — use it for a
command sent by mistake.

## 6. Good practice

- One command = one clear instruction. Put the what, the where and the
  deadline in the text or in **Due** / **About**.
- Tag only the people who must act. Use `@all` for things everyone must know.
- Keep **Urgent** for real stoppages and safety issues, so people keep taking
  it seriously.
- Do **not** put passwords or confidential information in commands. Until the
  planned security upgrade (SC-01) is finished, PPMS data is not yet fully
  protected.

## 7. For the administrator

- Database: `database/migrations/63_commands.sql` (tables `ppms_commands`,
  `ppms_command_recipients`, `ppms_command_replies`). The button stays hidden
  until this migration has been run.
- Code: `app/scripts/features/commands/index.js`,
  `app/styles/features/commands.css` (mirrored in `app-v2/`).
- Deactivated users cannot be tagged. A user's `@name` comes from their email,
  so changing someone's email changes their tag.
