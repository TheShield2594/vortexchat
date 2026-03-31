# 18 — Events & Calendar

> Covers: event creation, event RSVP, events calendar, upcoming events widget, iCal export, event reminders.

**Components under test:**
- `event-card.tsx`, `events-calendar.tsx`, `upcoming-events-widget.tsx`
- Pages: `channels/[serverId]/events/page.tsx`
- API: `/api/servers/[serverId]/events`, `/api/servers/[serverId]/events/[eventId]`
- API: `/api/servers/[serverId]/events/[eventId]/rsvp`
- API: `/api/servers/[serverId]/events/[eventId]/ical`
- API: `/api/servers/[serverId]/events/ical`
- Cron: `/api/cron/event-reminders`

---

## 18.1 Event Creation

### `event-create.spec.ts`

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | should create an event | Events page → Create → fill details → save | Event created |
| 2 | should set event title | Enter title | Title saved |
| 3 | should set event description | Enter description | Description saved |
| 4 | should set event date and time | Pick date/time | DateTime saved |
| 5 | should set event duration | Set end time or duration | Duration saved |
| 6 | should set event location (text/voice channel) | Select channel | Location saved |
| 7 | should set event cover image | Upload image | Image saved |
| 8 | should validate required fields | Submit empty form | Validation errors |
| 9 | should validate date is in the future | Set past date | Error |
| 10 | should require MANAGE_EVENTS permission | Login without permission | Create button hidden |

---

## 18.2 Event RSVP

### `event-rsvp.spec.ts`

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | should RSVP "Interested" | Click Interested on event | RSVP saved |
| 2 | should RSVP "Going" | Click Going | RSVP saved |
| 3 | should cancel RSVP | Click again to un-RSVP | RSVP removed |
| 4 | should show RSVP count | Multiple users RSVP | Count displayed |
| 5 | should show who is attending | View attendees | User list shown |

---

## 18.3 Events Calendar

### `events-calendar.spec.ts`

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | should show calendar view | Navigate to events page | Calendar displayed |
| 2 | should show events on correct dates | View calendar | Events placed on right dates |
| 3 | should navigate months | Click prev/next | Month changes |
| 4 | should click event to view details | Click event | Event details shown |
| 5 | should show today indicator | View current month | Today highlighted |

---

## 18.4 Event Cards & Widget

### `event-card.spec.ts`

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | should show event card with details | View event | Title, date, time, location, RSVP count |
| 2 | should show event status (upcoming/live/ended) | View different events | Correct status indicator |
| 3 | should show upcoming events widget | View channel sidebar | Widget with next events |
| 4 | should edit event | Click edit | Edit form opens |
| 5 | should delete event | Click delete → confirm | Event removed |

---

## 18.5 iCal Export

### `event-ical.spec.ts`

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | should export single event as .ics | Click "Add to Calendar" on event | .ics file downloads |
| 2 | should export all server events as iCal feed | Get iCal URL | Valid iCal feed |
| 3 | should contain correct event data in .ics | Parse downloaded file | Title, date, location correct |

---

## 18.6 Event Reminders

### `event-reminders.spec.ts`

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | should send reminder before event starts | RSVP → event approaching | Reminder notification |
| 2 | should run via cron | Check cron config | `/api/cron/event-reminders` scheduled |
| 3 | should only remind RSVP'd users | Non-RSVP user → no reminder | Only interested/going users notified |
