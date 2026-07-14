# Multidisciplinary UX Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn NACC-V2 into a true multidisciplinary-team workspace: staff + psychologist co-edit child records safely, the dashboard becomes a no-scroll bento with a mini calendar, results group per child, terminated cases are a reopenable admin archive, the instrument catalog moves into pre-assessment step 4 with the agency's real title lists, and the local-AI privacy guarantee is hardened.

**Architecture:** Django REST (backend/) + React/Vite (frontend/, RACCO design tokens, inline styles). Collaboration uses optimistic concurrency (409 on stale write) + cache-based presence polling — NO websockets (single local server, capstone scope). All AI stays on local Ollama.

**Tech Stack:** Django 5 / DRF, SQLite dev, React 18, react-router, recharts, react-big-calendar (full page only; mini widget is custom).

## Global Constraints

- Repo: `Desktop\NACC SYS\NACC-V2\` — its **own git repo**, remote `https://github.com/23150056-beep/NACC-SYS-V2`, branch `main`.
- Commits: **user is sole author — NEVER add a Claude co-author trailer.** Push to `origin main` after each completed task.
- Backend tests: from `backend/` run `./venv/Scripts/python.exe manage.py test` (218 green at plan time). Frontend has **no test harness** — verify with `npm run build` + browser (launch configs `v2-backend` / `v2-frontend` in v1's `.claude/launch.json`; backend runs `--noreload`, restart after backend edits; browser-pane screenshots time out on this machine — use `read_page`).
- **Copyright policy (V2 §2): instrument items, scales, scoring keys are NEVER stored — titles/metadata only.** The new seeded entries are titles only.
- Roles: Administrator, Psychologist, Staff (Staff = social worker).
- ⚠️ **Pre-flight:** `frontend/src/components/Sidebar.jsx`, `backend/clinical/reports_views.py`, `backend/clinical/tests/test_reports.py` have UNCOMMITTED changes from an in-flight "chart clinical interviews" session (plan `docs/superpowers/plans/2026-07-15-chart-clinical-interviews.md`). Finish/commit that work FIRST, or stash it — Task 8 and Task 10 also edit Sidebar.jsx.
- Dev seeds: `psy@racco1.gov.ph` / `psy12345` (Hannah) with child "Mika Santos" (id 2); admin `admin@racco1.gov.ph` / `admin1234`.

## Decisions locked for this plan (flag to user if they disagree at execution time)

1. **"Multimodal/Google-Docs collab" = optimistic concurrency + presence polling**, not live character-level sync. Rationale: single on-prem Django server, no Channels/Redis; a 409-guarded save with "who else is here" chip delivers the coordination value at capstone scope.
2. **"Recommendation" panel change** interpreted as: fields NOT asked in the RACCO I meeting (referral source/reason, education level, current placement, medical notes) move under a **"Recommendation"** section, plus a new free-text `recommendation` field. Backend field names unchanged (labels only + one new field).
3. **"Previous Custodian"** is a LABEL rename only — `surrendered_by` stays as the DB/API field name (avoids a risky rename migration; choices unchanged).
4. **Instrument catalog becomes shareable** (`owner=NULL` = agency-wide, mirroring AgencyFormTemplate) so the seeded official lists are visible to every psychologist. Admin creating without owner now means "shared" (previously a validation error).
5. **Sidebar**: "Pre-Assessment Instruments" page stays at `/instruments` but is relabelled — Admin sees "Instruments & Agency Forms" (both tabs); Psychologist entry becomes "Agency Form Templates" (forms tab only — catalog management now lives inside wizard step 4).
6. **Calendar**: `/schedule` route and page are kept as the "full screen" view; only the sidebar entry is removed. The dashboard mini calendar navigates there on click.
7. **Reopen case** is Admin-only (`POST /children/<id>/reopen/`); termination history is preserved forever and displayed in full.

---

### Task 1: Backend — psychologist can edit assigned children

**Files:**
- Modify: `backend/accounts/permissions.py` (append after `RecordsAccess`, ~line 37)
- Modify: `backend/children/views.py` (ChildViewSet)
- Modify: `backend/children/serializers.py` (ChildSerializer)
- Test: `backend/children/tests/test_child_collab.py` (new)

**Interfaces:**
- Produces: permission class `ChildRecordAccess`; PATCH/PUT `/api/children/<id>/` now allowed for the child's assigned psychologist; serializer rejects psychologist self-reassignment and any post-create `fullname` change; `updated_at` exposed read-only (needed by Task 2/3).

- [ ] **Step 1: Write the failing tests**

```python
# backend/children/tests/test_child_collab.py
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import Role, User
from children.models import Child


def make_user(email, role_name, **kw):
    role, _ = Role.objects.get_or_create(role_name=role_name)
    return User.objects.create_user(email=email, password="pass12345", role=role, **kw)


class PsychologistEditTests(APITestCase):
    def setUp(self):
        self.admin = make_user("a@t.ph", Role.ADMINISTRATOR)
        self.staff = make_user("s@t.ph", Role.STAFF)
        self.psych = make_user("p@t.ph", Role.PSYCHOLOGIST)
        self.other_psych = make_user("p2@t.ph", Role.PSYCHOLOGIST)
        self.child = Child.objects.create(fullname="Mika Santos",
                                          assigned_psychologist=self.psych)

    def patch(self, user, child, data):
        self.client.force_authenticate(user)
        return self.client.patch(f"/api/children/{child.id}/", data, format="json")

    def test_assigned_psychologist_can_edit(self):
        r = self.patch(self.psych, self.child, {"education_level": "Grade 4"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.child.refresh_from_db()
        self.assertEqual(self.child.education_level, "Grade 4")

    def test_unassigned_psychologist_cannot_edit(self):
        r = self.patch(self.other_psych, self.child, {"education_level": "x"})
        # queryset scoping means the record 404s for them
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_psychologist_cannot_reassign(self):
        r = self.patch(self.psych, self.child, {"psychologist": self.other_psych.id})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_psychologist_cannot_create(self):
        self.client.force_authenticate(self.psych)
        r = self.client.post("/api/children/", {"fullname": "New Kid"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_fullname_locked_on_update_for_everyone(self):
        r = self.patch(self.staff, self.child, {"fullname": "Renamed"})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
```

If `make_user`'s signature doesn't match `accounts.models` (check how existing tests in `backend/children/tests/` build users — e.g. `test_children.py`), copy their factory helper instead; the assertions stay the same.

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `./venv/Scripts/python.exe manage.py test children.tests.test_child_collab -v 2`
Expected: FAIL — psychologist PATCH returns 403 (write blocked by `RecordsAccess`), fullname test fails (no lock yet).

- [ ] **Step 3: Implement**

`backend/accounts/permissions.py` — append:

```python
class ChildRecordAccess(RecordsAccess):
    """RecordsAccess plus multidisciplinary collaboration: the child's
    assigned psychologist may edit (PUT/PATCH) the record. Create/archive
    stay Admin/Staff-only; queryset scoping already hides other children."""

    def has_permission(self, request, view):
        if super().has_permission(request, view):
            return True
        return bool(request.user and request.user.is_authenticated
                    and _role_name(request) == Role.PSYCHOLOGIST
                    and request.method in ("PUT", "PATCH"))

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        role = _role_name(request)
        if role in (Role.ADMINISTRATOR, Role.STAFF):
            return True
        return (role == Role.PSYCHOLOGIST
                and request.method in ("PUT", "PATCH")
                and obj.assigned_psychologist_id == request.user.id)
```

`backend/children/views.py` — import and use it on ChildViewSet only:

```python
from accounts.permissions import RecordsAccess, ChildRecordAccess
...
class ChildViewSet(_ArchivableViewSet):
    model = Child
    serializer_class = ChildSerializer
    permission_classes = [ChildRecordAccess]
```

(Note: `_ArchivableViewSet.archive` is a POST action → for a psychologist `has_object_permission` returns False because method is POST, keeping archive Admin/Staff. `terminate`/`advance_status` keep their own `IsAuthenticated` + in-body rule via `get_permissions` — unchanged.)

`backend/children/serializers.py` — add to `ChildSerializer`:

```python
    class Meta:
        model = Child
        fields = [
            ...existing fields...,
            "updated_at",
        ]
        read_only_fields = ["case_status", "updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        role = getattr(getattr(getattr(request, "user", None), "role", None),
                       "role_name", None) if request else None
        if self.instance:
            new_name = attrs.get("fullname")
            if new_name and new_name != self.instance.fullname:
                raise serializers.ValidationError(
                    {"fullname": "The child's name cannot be changed after the record is created."})
            if role == "Psychologist":
                if ("assigned_psychologist" in attrs
                        and attrs["assigned_psychologist"] != self.instance.assigned_psychologist):
                    raise serializers.ValidationError(
                        {"psychologist": "Only administrators or staff can reassign a psychologist."})
                attrs.pop("assignee_sees_history", None)
                attrs.pop("status", None)
        return attrs
```

(Use `Role.PSYCHOLOGIST` via `from accounts.models import Role` and compare `role == Role.PSYCHOLOGIST` if the constant exists — check `accounts/models.py`; the string literal is the fallback.)

- [ ] **Step 4: Run tests — new file passes AND the whole suite stays green**

Run: `./venv/Scripts/python.exe manage.py test`
Expected: PASS, 223+ tests (218 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add backend/accounts/permissions.py backend/children/views.py backend/children/serializers.py backend/children/tests/test_child_collab.py
git commit -m "feat(records): assigned psychologist can edit their child's record"
```

---

### Task 2: Backend — concurrent-edit safety (409) + presence heartbeat

**Files:**
- Modify: `backend/children/views.py` (ChildViewSet)
- Test: append to `backend/children/tests/test_child_collab.py`

**Interfaces:**
- Consumes: `updated_at` exposed by Task 1.
- Produces: writes carrying `expected_updated_at` (ISO string) get **409 + `{"detail", "current": <fresh record>}`** when stale; `GET/POST /api/children/<id>/presence/` — POST registers a 30s heartbeat, GET returns `{"others": [{"name","role"}]}` excluding self.

- [ ] **Step 1: Write the failing tests** (append to test_child_collab.py)

```python
class ConcurrencyPresenceTests(APITestCase):
    def setUp(self):
        self.staff = make_user("s2@t.ph", Role.STAFF)
        self.psych = make_user("p3@t.ph", Role.PSYCHOLOGIST)
        self.child = Child.objects.create(fullname="Ana Cruz",
                                          assigned_psychologist=self.psych)

    def test_stale_write_conflicts(self):
        self.client.force_authenticate(self.staff)
        stale = "2000-01-01T00:00:00+00:00"
        r = self.client.patch(f"/api/children/{self.child.id}/",
                              {"education_level": "G1", "expected_updated_at": stale},
                              format="json")
        self.assertEqual(r.status_code, 409)
        self.assertIn("current", r.data)

    def test_fresh_write_passes(self):
        self.client.force_authenticate(self.staff)
        current = self.client.get(f"/api/children/{self.child.id}/").data["updated_at"]
        r = self.client.patch(f"/api/children/{self.child.id}/",
                              {"education_level": "G1", "expected_updated_at": current},
                              format="json")
        self.assertEqual(r.status_code, 200)

    def test_presence_roundtrip(self):
        self.client.force_authenticate(self.psych)
        self.client.post(f"/api/children/{self.child.id}/presence/")
        self.client.force_authenticate(self.staff)
        r = self.client.get(f"/api/children/{self.child.id}/presence/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["others"]), 1)
```

- [ ] **Step 2: Run to verify failure** — `manage.py test children.tests.test_child_collab -v 2` → 409 test fails (PATCH returns 200), presence 404s (no route).

- [ ] **Step 3: Implement** — in `backend/children/views.py`, inside `ChildViewSet`:

```python
import time
from django.core.cache import cache
from children.serializers import ChildSerializer
...
    def update(self, request, *args, **kwargs):
        expected = request.data.get("expected_updated_at")
        if expected:
            instance = self.get_object()
            if instance.updated_at.isoformat() != expected:
                return Response(
                    {"detail": "This record was updated by someone else while you were editing.",
                     "current": self.get_serializer(instance).data},
                    status=status.HTTP_409_CONFLICT)
        return super().update(request, *args, **kwargs)

    PRESENCE_TTL = 30  # seconds a heartbeat stays visible

    @action(detail=True, methods=["get", "post"])
    def presence(self, request, pk=None):
        child = self.get_object()
        key = f"child-presence:{child.id}"
        now = time.time()
        entries = {k: v for k, v in (cache.get(key) or {}).items()
                   if now - v["ts"] < self.PRESENCE_TTL}
        if request.method == "POST":
            entries[str(request.user.id)] = {
                "name": getattr(request.user, "fullname", "") or request.user.get_username(),
                "role": getattr(getattr(request.user, "role", None), "role_name", "") or "",
                "ts": now,
            }
            cache.set(key, entries, self.PRESENCE_TTL * 2)
        others = [{"name": v["name"], "role": v["role"]}
                  for k, v in entries.items() if k != str(request.user.id)]
        return Response({"others": others})
```

`presence` must be reachable by all three roles on records they can see: add it to the `get_permissions` special-case so psychologists aren't blocked by write rules — it only needs `IsAuthenticated` + queryset scoping:

```python
    def get_permissions(self):
        if self.action in ("terminate", "advance_status", "presence"):
            return [IsAuthenticated()]
        return super().get_permissions()
```

(Queryset note: `presence` is not in the `("retrieve", "terminate")` special-case, so psychologists resolve only their own children — correct. Staff/Admin resolve all active.)

- [ ] **Step 4: Run tests** — full suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/children/views.py backend/children/tests/test_child_collab.py
git commit -m "feat(records): optimistic-lock 409 on stale saves + presence heartbeat"
```

---

### Task 3: Frontend — collab UI (psychologist edit, conflict banner, presence chip)

**Files:**
- Modify: `frontend/src/pages/Children.jsx`

**Interfaces:**
- Consumes: Task 1 permission (psych PATCH), Task 2 `expected_updated_at` 409 + `/presence/`.

- [ ] **Step 1: Enable edit for the assigned psychologist.** In `Children.jsx`:

```jsx
const canEditRecord = (c) => canManage
  || (isPsych && c.status === 'active' && String(c.psychologist) === String(user?.id));
```

Use it for: the row pencil button (line ~220, replace the `canManage &&` guard), and the drawer's Edit button — pass `canEdit={canEditRecord(sel)}` into `ChildDrawer` and render Edit when `canEdit` (drawer currently keys off `canManage`).

- [ ] **Step 2: Psychologist-safe form.** In `ChildForm`, accept a new prop `isPsych`; when true, replace the "Assign Psychologist" select + carry-history block with a read-only row showing the current assignment ("Reassignment is done by admin/staff."). In `save()` keep sending the unchanged `psychologist` value.

- [ ] **Step 3: Conflict-aware save.** In `save()`:

```jsx
const payload = { ...form, expected_updated_at: form.updated_at };
// existing `delete payload.x` lines stay; also: delete payload.updated_at;
...
} catch (err) {
  if (err.response?.status === 409) {
    const fresh = err.response.data.current;
    setError('');
    setForm((f) => ({ ...f, _conflict: fresh }));
    toast.error('Someone updated this record while you were editing.');
    return;
  }
  ...existing handling...
}
```

In `ChildForm`, when `form._conflict` render an `<Alert tone="warning">` at the top: "**{conflict.psychologist_name ? '' : ''}This record was just changed by a teammate.** Load their latest version, then re-apply your edits." with a Button "Load latest" → `setForm({ ...EMPTY, ...form._conflict, psychologist: form._conflict.psychologist || '', _origPsychologist: form._conflict.psychologist || '' })`.

- [ ] **Step 4: Presence hook.** Top of `Children.jsx` (module scope):

```jsx
function usePresence(childId) {
  const [others, setOthers] = useState([]);
  useEffect(() => {
    if (!childId) { setOthers([]); return; }
    let alive = true;
    const beat = () => api.post(`/children/${childId}/presence/`)
      .then((r) => alive && setOthers(r.data.others || [])).catch(() => {});
    beat();
    const t = setInterval(beat, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [childId]);
  return others;
}
```

Call `const others = usePresence(form?.id || sel?.id);` in `Children()`, pass `others` to both `ChildDrawer` and `ChildForm`; each renders under its header when non-empty:

```jsx
{others.length > 0 && (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 20px', background: 'var(--blue-50)', borderBottom: '1px solid var(--blue-100)' }}>
    <Icon name="users" size={14} style={{ color: 'var(--blue-600)' }} />
    {others.map((o, i) => <Badge key={i} tone="brand" size="sm" dot>{o.name} ({o.role}) is here</Badge>)}
  </div>
)}
```

- [ ] **Step 5: Verify** — `npm run build` passes. Live check (two browsers: staff + psychologist on the same child): psychologist edits an assigned child, staff sees "is here" chip, staff save after psychologist save triggers the conflict alert; "Load latest" pulls fresh values.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Children.jsx
git commit -m "feat(records): multidisciplinary co-editing — psych edit, presence chips, conflict recovery"
```

---

### Task 4: Backend — termination archive history + admin reopen

**Files:**
- Modify: `backend/children/serializers.py`, `backend/children/views.py`
- Test: `backend/children/tests/test_reopen.py` (new)

**Interfaces:**
- Produces: `ChildSerializer.terminations` (full history list, newest first: `{date, reason_category, note, terminated_by}`); `POST /api/children/<id>/reopen/` (Admin-only) → 200 `{status:"active", case_status:"pre_assessment"}`; TerminationRecords are never deleted.

- [ ] **Step 1: Failing tests**

```python
# backend/children/tests/test_reopen.py
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import Role
from children.models import Child, TerminationRecord
from children.tests.test_child_collab import make_user


class ReopenTests(APITestCase):
    def setUp(self):
        self.admin = make_user("ra@t.ph", Role.ADMINISTRATOR)
        self.psych = make_user("rp@t.ph", Role.PSYCHOLOGIST)
        self.child = Child.objects.create(
            fullname="Back Again", status=Child.INACTIVE,
            case_status=Child.STAGE_TERMINATED, assigned_psychologist=self.psych)
        TerminationRecord.objects.create(
            child=self.child, terminated_by=self.psych,
            reason_category="Services completed", note="Done for now.")

    def test_admin_reopen_restores_active_and_keeps_history(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(f"/api/children/{self.child.id}/reopen/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.child.refresh_from_db()
        self.assertEqual(self.child.status, Child.ACTIVE)
        self.assertEqual(self.child.case_status, Child.STAGE_PRE_ASSESSMENT)
        self.assertEqual(self.child.terminations.count(), 1)  # history kept

    def test_non_admin_cannot_reopen(self):
        self.client.force_authenticate(self.psych)
        r = self.client.post(f"/api/children/{self.child.id}/reopen/")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_reopen_active_child_400(self):
        self.client.force_authenticate(self.admin)
        active = Child.objects.create(fullname="Still Active")
        r = self.client.post(f"/api/children/{active.id}/reopen/")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_serializer_exposes_termination_history(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get(f"/api/children/{self.child.id}/")
        self.assertEqual(len(r.data["terminations"]), 1)
        self.assertEqual(r.data["terminations"][0]["reason_category"], "Services completed")
```

- [ ] **Step 2: Run to verify failure** — reopen 404s (no route), `terminations` KeyError.

- [ ] **Step 3: Implement.** Serializer — add method field (keep the existing singular `termination` for back-compat):

```python
    terminations = serializers.SerializerMethodField()
    # add "terminations" to Meta.fields

    def get_terminations(self, obj):
        out = []
        for t in obj.terminations.all():  # Meta.ordering: newest first
            by = t.terminated_by
            out.append({
                "date": t.date, "reason_category": t.reason_category, "note": t.note,
                "terminated_by": (getattr(by, "fullname", "") or getattr(by, "username", "")) or None,
            })
        return out
```

Views — `ChildViewSet`: allow the action through permissions/queryset like terminate, then:

```python
    def get_permissions(self):
        if self.action in ("terminate", "advance_status", "presence", "reopen"):
            return [IsAuthenticated()]
        return super().get_permissions()

    # in get_queryset, widen the retrieve special-case:
        if self.action in ("retrieve", "terminate", "reopen"):
            qs = self.model.objects.all().order_by("fullname")

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Admin-only: a terminated child returned to the clinic. Reactivate
        the case on top of the archived record — history is retained."""
        child = self.get_object()
        role = getattr(getattr(request.user, "role", None), "role_name", None)
        if role != Role.ADMINISTRATOR:
            return Response({"detail": "Only an administrator can reopen a terminated case."},
                            status=status.HTTP_403_FORBIDDEN)
        if child.status != Child.INACTIVE:
            return Response({"detail": "This case is already active."},
                            status=status.HTTP_400_BAD_REQUEST)
        child.status = Child.ACTIVE
        child.case_status = Child.STAGE_PRE_ASSESSMENT
        child.save(update_fields=["status", "case_status", "updated_at"])
        self._log(child, ActivityLog.UPDATED)
        return Response({"status": child.status, "case_status": child.case_status})
```

Also update the stale message in `advance_status` ("reactivation is not supported") → "This case is terminated; an administrator can reopen it from the child's record."

- [ ] **Step 4: Full suite green.**

- [ ] **Step 5: Commit** — `feat(records): termination history + admin reopen for returning children`

---

### Task 5: Frontend — admin archive view & reopen

**Files:**
- Modify: `frontend/src/pages/Children.jsx`

**Interfaces:** Consumes Task 4 (`terminations`, `/reopen/`).

- [ ] **Step 1:** Rename the status filter label `Inactive` → `Archived` (`STATUS_FILTERS`, and `StatusChip` inactive text → `Archived (Terminated)`), so the roster's Inactive tab reads as the archive. (Terminated records are already retained and listed — this makes it explicit.)

- [ ] **Step 2:** In `ChildDrawer`, replace the single-termination block with a full history list driven by `child.terminations`:

```jsx
{child.status === 'inactive' && (child.terminations || []).length > 0 && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div className="racco-eyebrow" style={{ fontSize: 10 }}>Termination history ({child.terminations.length})</div>
    {child.terminations.map((t, i) => (
      <div key={i} style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--ink-50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{t.reason_category}</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-body)', margin: '4px 0 0', lineHeight: 1.5 }}>{t.note}</p>
        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t.date}{t.terminated_by ? ` · by ${t.terminated_by}` : ''}</div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3:** Reopen button. Pass `isAdmin` into `ChildDrawer`; when `isAdmin && child.status === 'inactive'` show footer `<Button variant="primary" fullWidth iconLeft={<Icon name="rotate-ccw" size={16} />}>Reopen Case</Button>` → `window.confirm('Reopen this case? All previous records and termination history are kept.')` then:

```jsx
const reopen = async (c) => {
  try {
    await api.post(`/children/${c.id}/reopen/`);
    toast.success(`${c.fullname}'s case is active again — previous records retained`);
    setSel(null); load(); refreshActivity();
  } catch (err) { toast.error(err.response?.data?.detail || 'Could not reopen the case.'); }
};
```

- [ ] **Step 4: Verify** — build + browser: terminate a seed child as admin, see it under Archived with history, reopen it, confirm history still shows if terminated again.

- [ ] **Step 5: Commit** — `feat(records): archived-case history view + admin reopen`

---

### Task 6: Child record panel — Previous Custodian, Address, Recommendation

**Files:**
- Modify: `backend/children/models.py`, `backend/children/serializers.py` (+ auto migration)
- Modify: `frontend/src/pages/Children.jsx`
- Test: append one test to `backend/children/tests/test_child_collab.py`

**Interfaces:** Produces `Child.recommendation` (TextField, blank) in API.

- [ ] **Step 1: Failing test** — append:

```python
    def test_recommendation_field_roundtrip(self):
        r = self.patch(self.staff, self.child, {"recommendation": "Refer for art therapy."})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["recommendation"], "Refer for art therapy.")
```

- [ ] **Step 2:** Model: after `medical_notes` add

```python
    # Free-text recommendations + fields not part of the agency's intake
    # interview live under the "Recommendation" section in the UI.
    recommendation = models.TextField(blank=True)
```

Run `./venv/Scripts/python.exe manage.py makemigrations children` then `migrate`. Add `"recommendation"` to `ChildSerializer.Meta.fields`.

- [ ] **Step 3: Frontend labels + regrouping** in `Children.jsx`:
  - `EMPTY` gains `recommendation: ''`.
  - Drawer `fields`: `['Surrendered By', ...]` → `['Previous Custodian', child.surrendered_by || '—']`; `['Location', location]` → `['Address', location]` (keep the barangay/municipality/province join). Remove `Referral Source`, `Education Level`, `Current Placement` from the main `fields` list.
  - Drawer: after the fields loop add a "Recommendation" group:

```jsx
<div>
  <div className="racco-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Recommendation</div>
  {child.recommendation && <p style={{ fontSize: 13, color: 'var(--text-body)', margin: '0 0 10px', lineHeight: 1.55 }}>{child.recommendation}</p>}
  {[['Referral Source', child.referral_source], ['Education Level', child.education_level], ['Current Placement', child.current_placement]]
    .filter(([, v]) => v).map(([k, v]) => (
      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingBottom: 10, borderBottom: '1px solid var(--ink-100)', marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{k}</span>
        <span style={{ fontSize: 13.5, color: 'var(--text-strong)', fontWeight: 700, textAlign: 'right' }}>{v}</span>
      </div>
  ))}
</div>
```

  (Referral reason + medical notes blocks stay where they are, but move them visually below the Recommendation group.)
  - Form: label `"Who Surrendered the Child"` → `"Previous Custodian"`; the `Profiling` eyebrow → `Recommendation` with hint text "Details beyond the agency's intake interview." and add at its end:

```jsx
<FormField label="Recommendation" hint="Follow-ups, referrals, and notes outside the intake timeline.">
  <textarea value={form.recommendation || ''} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} rows={3} style={textarea} />
</FormField>
```

- [ ] **Step 4:** Backend suite green; `npm run build`; browser check drawer + form labels.

- [ ] **Step 5: Commit** — `feat(records): previous-custodian/address labels + recommendation section`

---

### Task 7: Backend — shared instrument catalog, audience, official title seeds

**Files:**
- Modify: `backend/clinical/models.py` (InstrumentCatalog), `backend/clinical/views.py` (InstrumentCatalogViewSet), instrument serializer in `backend/clinical/serializers.py` (+ auto migration)
- Create: `backend/clinical/management/commands/seed_instrument_titles.py`
- Test: `backend/clinical/tests/test_instrument_sharing.py` (new)

**Interfaces:**
- Produces: `InstrumentCatalog.audience` ∈ `child|adoptive_parent|both` (default `child`, exposed in API); psychologists see own + shared (`owner=NULL`) instruments; admins may create shared ones; `manage.py seed_instrument_titles` idempotently seeds 10 shared titles.

- [ ] **Step 1: Failing tests**

```python
# backend/clinical/tests/test_instrument_sharing.py
from django.core.management import call_command
from rest_framework.test import APITestCase
from accounts.models import Role
from children.tests.test_child_collab import make_user
from clinical.models import InstrumentCatalog


class InstrumentSharingTests(APITestCase):
    def setUp(self):
        self.admin = make_user("ia@t.ph", Role.ADMINISTRATOR)
        self.psych = make_user("ip@t.ph", Role.PSYCHOLOGIST)
        self.shared = InstrumentCatalog.objects.create(
            title="Raven's Progressive Matrices", owner=None, audience="both")
        self.own = InstrumentCatalog.objects.create(
            title="My Checklist", owner=self.psych, audience="child")

    def test_psychologist_sees_shared_plus_own(self):
        self.client.force_authenticate(self.psych)
        titles = [i["title"] for i in self.client.get("/api/instruments/").data]
        self.assertIn("Raven's Progressive Matrices", titles)
        self.assertIn("My Checklist", titles)

    def test_psychologist_cannot_edit_shared(self):
        self.client.force_authenticate(self.psych)
        r = self.client.patch(f"/api/instruments/{self.shared.id}/", {"title": "X"}, format="json")
        self.assertIn(r.status_code, (403, 404))

    def test_admin_create_without_owner_is_shared(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post("/api/instruments/", {"title": "Shared One"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(InstrumentCatalog.objects.get(title="Shared One").owner)

    def test_seed_command_idempotent(self):
        call_command("seed_instrument_titles")
        first = InstrumentCatalog.objects.filter(owner__isnull=True).count()
        call_command("seed_instrument_titles")
        self.assertEqual(InstrumentCatalog.objects.filter(owner__isnull=True).count(), first)
        self.assertTrue(InstrumentCatalog.objects.filter(
            title="Children's Apperception Test", audience="child").exists())
        self.assertTrue(InstrumentCatalog.objects.filter(
            title="Marital Satisfaction Inventory", audience="adoptive_parent").exists())
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** Model — add to `InstrumentCatalog`:

```python
    AUDIENCE_CHOICES = [
        ("child", "For children"),
        ("adoptive_parent", "For prospective adoptive parents"),
        ("both", "Both"),
    ]
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES, default="child")
```

`makemigrations clinical && migrate`. Serializer: add `"audience"` to fields; make `owner` optional/nullable if it isn't.

Views — `InstrumentCatalogViewSet.get_queryset` psychologist branch (line ~46) becomes:

```python
            qs = qs.filter(Q(owner=self.request.user) | Q(owner__isnull=True))
```

(`from django.db.models import Q` already imported for templates.) `perform_create`: psychologist → `serializer.save(owner=self.request.user)` (unchanged); admin → `serializer.save(owner=serializer.validated_data.get("owner"))` — **delete** the "Select the psychologist who owns this instrument." ValidationError (no owner now means shared). Add write guard mirroring the template pattern:

```python
    def perform_update(self, serializer):
        obj = self.get_object()
        if _role(self.request) == Role.PSYCHOLOGIST and obj.owner_id != self.request.user.id:
            raise PermissionDenied("Shared instruments are managed by the administrator.")
        ...existing save...
```

Apply the same owner check inside the `deactivate` action if it exists (grep for `def deactivate` in the viewset).

Seed command:

```python
# backend/clinical/management/commands/seed_instrument_titles.py
from django.core.management.base import BaseCommand
from clinical.models import InstrumentCatalog

# RACCO I's official pre-assessment battery (titles only — copyright policy).
TITLES = [
    # For children
    ("Children's Problem Checklist", "behavioral", "child"),
    ("Adolescent Problem Checklist", "behavioral", "child"),
    ("Multiscore Depression Inventory for Children", "personality", "child"),
    ("Slosson Intelligence Test", "cognitive", "child"),
    ("Children's Apperception Test", "projective", "child"),
    # Used with both children and prospective adoptive parents
    ("Raven's Progressive Matrices", "cognitive", "both"),
    ("Sentence Completion Series", "projective", "both"),
    # For prospective adoptive parents
    ("Basic Personality Inventory", "personality", "adoptive_parent"),
    ("Marital Satisfaction Inventory", "other", "adoptive_parent"),
    ("Thematic Apperception Test", "projective", "adoptive_parent"),
]


class Command(BaseCommand):
    help = "Seed the shared (agency-wide) instrument title catalog. Idempotent."

    def handle(self, *args, **options):
        created = 0
        for title, category, audience in TITLES:
            _, was_created = InstrumentCatalog.objects.get_or_create(
                title=title, owner=None,
                defaults={"category": category, "audience": audience})
            created += int(was_created)
        self.stdout.write(self.style.SUCCESS(
            f"seed_instrument_titles: {created} created, {len(TITLES) - created} already present."))
```

- [ ] **Step 4:** Full suite green. Then seed the dev DB: `./venv/Scripts/python.exe manage.py seed_instrument_titles`.

- [ ] **Step 5: Commit** — `feat(instruments): shared agency catalog + audience + official title seeds`

---

### Task 8: Frontend — instrument module inside pre-assessment step 4

**Files:**
- Create: `frontend/src/components/InstrumentFormDrawer.jsx` (extracted from Instruments.jsx)
- Modify: `frontend/src/pages/Instruments.jsx`, `frontend/src/pages/PreAssessment.jsx`, `frontend/src/components/Sidebar.jsx`

**Interfaces:** Consumes Task 7 (`audience`, shared catalog). Produces `<InstrumentFormDrawer form setForm psychologists isAdmin error onSave onClose />`.

- [ ] **Step 1: Extract the drawer.** Move the instrument add/edit drawer JSX (Instruments.jsx lines ~201-237) plus its `CATEGORIES` list into the new component; add an Audience select:

```jsx
// frontend/src/components/InstrumentFormDrawer.jsx
import React from 'react';
import { Button, Input, Select, FormField, Alert, Icon, iconBtn, hoverLift } from '../ui';

export const CATEGORIES = [
  { v: 'cognitive', label: 'Cognitive' }, { v: 'behavioral', label: 'Behavioral' },
  { v: 'projective', label: 'Projective' }, { v: 'personality', label: 'Personality' },
  { v: 'developmental', label: 'Developmental' }, { v: 'achievement', label: 'Achievement' },
  { v: 'other', label: 'Other' },
];
export const AUDIENCES = [
  { v: 'child', label: 'For children' },
  { v: 'adoptive_parent', label: 'For prospective adoptive parents' },
  { v: 'both', label: 'Both' },
];
export const EMPTY_INSTRUMENT = { title: '', publisher: '', category: 'other', audience: 'child', age_range: '', notes: '', owner: '' };

export default function InstrumentFormDrawer({ form, setForm, psychologists = [], isAdmin = false, error, onSave, onClose }) {
  /* ...the exact drawer JSX moved from Instruments.jsx, with one added field
     after Category/Age Range:
     <FormField label="Audience">
       <Select value={form.audience || 'child'} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
         {AUDIENCES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
       </Select>
     </FormField>
     and, for isAdmin, the owner select gains
     <option value="">— Shared (all psychologists) —</option> as the empty option. */
}
```

(Copy the JSX verbatim — buttons, save footer, error alert — replacing `saveInstrument`/`setForm(null)` with the `onSave`/`onClose` props.) Update `Instruments.jsx` to import and use it (`import InstrumentFormDrawer, { CATEGORIES, EMPTY_INSTRUMENT } from '../components/InstrumentFormDrawer';`), removing the duplicated JSX and the admin owner-required validation in `saveInstrument` (shared is now legal).

- [ ] **Step 2: Wizard step 4 gets the full module.** In `PreAssessment.jsx` step 3 card:
  - Import: `import InstrumentFormDrawer, { EMPTY_INSTRUMENT } from '../components/InstrumentFormDrawer';` and `useAuth`.
  - State: `const [instForm, setInstForm] = useState(null); const [instError, setInstError] = useState('');`
  - Reload helper: `const reloadInstruments = () => api.get('/instruments/').then((r) => setInstruments(r.data)).catch(() => {});`
  - Header row inside the card: title + `<Button variant="secondary" onClick={() => { setInstError(''); setInstForm({ ...EMPTY_INSTRUMENT }); }} iconLeft={<Icon name="plus" size={15} />}>Add instrument title</Button>`.
  - Render grouped: `const kids = instruments.filter((i) => i.audience !== 'adoptive_parent'); const paps = instruments.filter((i) => i.audience === 'adoptive_parent' || i.audience === 'both');` — two sections with eyebrows "For children" and "For prospective adoptive parents", each reusing the existing checkbox-label rows. Add a pencil `iconBtn` on rows the psychologist owns (`String(i.owner) === String(user?.id)`) → `setInstForm({ ...i, owner: i.owner || '' })`.
  - Save handler:

```jsx
const saveInstrument = async () => {
  setInstError('');
  if (!instForm.title.trim()) { setInstError('Title is required.'); return; }
  const payload = { ...instForm };
  delete payload.owner; delete payload.owner_name; delete payload.updated_at;
  try {
    if (instForm.id) await api.put(`/instruments/${instForm.id}/`, payload);
    else await api.post('/instruments/', payload);
    toast.success(instForm.id ? 'Instrument updated' : 'Instrument added');
    setInstForm(null); reloadInstruments();
  } catch (err) { setInstError(JSON.stringify(err.response?.data || 'Save failed')); }
};
```

  - Render `{instForm && <InstrumentFormDrawer form={instForm} setForm={setInstForm} error={instError} onSave={saveInstrument} onClose={() => setInstForm(null)} />}` at the end of the component.

- [ ] **Step 3: Sidebar + page gating.**
  - `Sidebar.jsx` NAV: replace the instruments row with two rows:

```jsx
{ to: '/instruments', label: 'Instruments & Agency Forms', icon: 'clipboard-pen', roles: ['Administrator'] },
{ to: '/instruments', label: 'Agency Form Templates', icon: 'file-text', roles: ['Psychologist'] },
```

  - `Instruments.jsx`: for psychologists default `tab` to `'forms'` and hide the tab switcher + catalog tab (`const showCatalog = isAdmin;`); the info alert for psychologists reads "Manage your consent and interview form templates. Instrument titles are managed inside the Pre-Assessment wizard (step 4)."

- [ ] **Step 4: Verify** — build; browser as psychologist: wizard step 4 shows both groups incl. the 10 seeded titles, add + edit inline works, selection still saves and completes; `/instruments` shows forms only. As admin: `/instruments` shows both tabs with Audience field and shared owner option.

- [ ] **Step 5: Commit** — `feat(pre-assessment): full instrument module embedded in step 4; sidebar split`

---

### Task 9: Frontend — Results & Reports grouped per child

**Files:**
- Modify: `frontend/src/pages/Report.jsx`

- [ ] **Step 1: Group + expand.** Add state `const [openChild, setOpenChild] = useState(null);` and a grouping memo after `visibleEntries`:

```jsx
const grouped = useMemo(() => {
  const map = new Map();
  for (const e of visibleEntries) {
    if (!map.has(e.child)) map.set(e.child, { child: e.child, child_name: e.child_name, entries: [] });
    map.get(e.child).entries.push(e);
  }
  return [...map.values()].sort((a, b) => (a.child_name || '').localeCompare(b.child_name || ''));
}, [visibleEntries]);
```

Replace the results-tab `<tbody>` with one header row per child + expandable detail rows:

```jsx
<thead><tr style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--border)' }}>
  {['Child', 'Entries', 'Latest Entry', 'Latest Classification', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
</tr></thead>
<tbody>
  {grouped.map((g) => {
    const open = openChild === g.child;
    const latest = g.entries[0]; // visibleEntries already sorted newest-first
    return (
      <React.Fragment key={g.child}>
        <tr tabIndex={0} role="button" aria-expanded={open}
          onClick={() => setOpenChild(open ? null : g.child)}
          onKeyDown={(ev) => { if (ev.key === 'Enter') setOpenChild(open ? null : g.child); }}
          style={{ borderBottom: '1px solid var(--ink-100)', cursor: 'pointer' }}
          onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--blue-50)')}
          onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}>
          <td style={{ padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--blue-700)' }}>{g.child_name}</div>
            <div className="racco-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{caseRef(g.child)}</div>
          </td>
          <td style={td}><Badge tone="brand" size="sm">{g.entries.length}</Badge></td>
          <td style={td}>{latest?.date || '—'}</td>
          <td style={{ ...td, fontWeight: 600, color: 'var(--text-strong)' }}>{latest?.classification || '—'}</td>
          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} style={{ color: 'var(--text-faint)' }} />
          </td>
        </tr>
        {open && g.entries.map((e) => (
          <tr key={e.id} onClick={() => navigate(`/report/child/${e.child}`)}
            style={{ borderBottom: '1px solid var(--ink-100)', cursor: 'pointer', background: 'var(--ink-50)' }}>
            <td style={{ ...td, paddingLeft: 34, fontSize: 12.5 }}>{e.instrument_title || 'No instrument'}</td>
            <td style={td}></td>
            <td style={{ ...td, fontSize: 12.5 }}>{e.date}</td>
            <td style={{ ...td, fontSize: 12.5 }}>{e.classification || '—'}</td>
            <td style={{ ...td, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{e.entered_by_name || ''}</td>
          </tr>
        ))}
      </React.Fragment>
    );
  })}
</tbody>
```

Update the tab label to `Result Entries (${grouped.length} children)` — wait, keep count of entries but show children: `['results', `Result Entries (${entries.length})`]` stays fine. CSV export keeps the flat `visibleEntries` (unchanged).

- [ ] **Step 2: Verify** — build; browser: Mika Santos shows one row with entry count; clicking expands all her entries; an expanded entry opens `/report/child/2`.

- [ ] **Step 3: Commit** — `feat(reports): result entries grouped per child with expandable history`

---

### Task 10: Frontend — bento dashboard, mini calendar, calendar off the sidebar

**Files:**
- Create: `frontend/src/components/MiniCalendar.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`, `frontend/src/components/Sidebar.jsx`

**Interfaces:** Consumes existing `GET /api/reports/dashboard/?range=monthly` and `GET /api/appointments/` (role-scoped). NO backend changes (reports_views.py is touched by the in-flight session).

- [ ] **Step 1: MiniCalendar component** — custom month grid, appointment dots, click → full calendar:

```jsx
// frontend/src/components/MiniCalendar.jsx
import React, { useMemo, useState } from 'react';
import { Icon } from '../ui';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function MiniCalendar({ appointments = [], onOpen }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const marked = useMemo(() => {
    const s = new Set();
    appointments.forEach((a) => { if (a.start) s.add(String(a.start).slice(0, 10)); });
    return s;
  }, [appointments]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const out = [];
    for (let i = 0; i < first.getDay(); i++) out.push(null);
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return out;
  }, [cursor]);

  const today = key(new Date());
  const nav = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}
      role="button" tabIndex={0} title="Open the full calendar"
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button aria-label="Previous month" onClick={(e) => { e.stopPropagation(); nav(-1); }}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Icon name="chevron-left" size={16} /></button>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13.5, color: 'var(--text-strong)' }}>
          {cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button aria-label="Next month" onClick={(e) => { e.stopPropagation(); nav(1); }}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Icon name="chevron-right" size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, textAlign: 'center' }}>
        {DOW.map((d) => <span key={d} style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)', letterSpacing: '0.04em' }}>{d}</span>)}
        {cells.map((d, i) => d === null ? <span key={`x${i}`} /> : (
          <span key={key(d)} style={{
            position: 'relative', fontSize: 11.5, fontWeight: key(d) === today ? 800 : 600,
            padding: '4px 0', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)',
            background: key(d) === today ? 'var(--blue-600)' : 'transparent',
            color: key(d) === today ? '#fff' : 'var(--text-body)',
          }}>
            {d.getDate()}
            {marked.has(key(d)) && <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: 4, height: 4, borderRadius: '50%', background: key(d) === today ? '#fff' : 'var(--blue-500)' }} />}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--blue-600)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon name="maximize-2" size={12} /> Click to open the full calendar
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Bento Dashboard.** Rework `Dashboard.jsx` around a viewport-fit grid; every existing module is kept but becomes a fixed-height tile with internal scrolling. Add `const [appointments, setAppointments] = useState([]);` and fetch `api.get('/appointments/').then((r) => setAppointments(r.data)).catch(() => {});` alongside the stats fetch. Layout skeleton (replace the current return; reuse the existing tile JSX inside `<Tile>` wrappers):

```jsx
const Tile = ({ children, span = 1, ...cardProps }) => (
  <Card {...cardProps} padding="16px"
    style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', minHeight: 0, ...cardProps.style }}>
    <div className="racco-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
  </Card>
);

return (
  <div style={{ padding: '18px 22px', height: 'calc(100vh - var(--topbar-h, 64px))', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
    {/* Row 1 — slim quick actions */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 'none' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--text-strong)', marginRight: 4 }}>Quick actions</span>
      {actions.map((a) => (
        <Button key={a.label} variant={a.variant} onClick={() => navigate(a.to)} iconLeft={<Icon name={a.icon} size={16} />}>{a.label}</Button>
      ))}
    </div>
    {/* Row 2 — stat tiles */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, flex: 'none' }}>
      {/* the 4 existing StatCards unchanged */}
    </div>
    {/* Bento body — two fixed rows, tiles scroll internally */}
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gridTemplateRows: 'minmax(0,1fr) minmax(0,1fr)' }}>
      <Tile eyebrow="Today" title="Schedule" span={2}>{/* today_schedule strip + availability (existing JSX) */}</Tile>
      <Tile eyebrow="Schedule" title="Calendar"><MiniCalendar appointments={appointments} onOpen={() => navigate('/schedule')} /></Tile>
      <Tile eyebrow="Follow-up needed" title="Care-gap alerts">{/* existing gaps list — drop the .slice(0,8), the tile scrolls */}</Tile>
      <Tile eyebrow="Census" title="Intake vs. termination" span={2}>{/* existing BarChart at height 180 + case-mix badges */}</Tile>
      <Tile eyebrow="Clinical team" title="Sessions by psychologist">{/* existing per_psychologist + counseling badges */}</Tile>
      <Tile eyebrow="Live" title="Activity Feed">{/* existing feed — use events.slice(0, 15); tile scrolls */}</Tile>
    </div>
  </div>
);
```

Notes for the implementer: check `frontend/src/ui` for how `Card` handles `style`/`padding` (it already accepts both — Dashboard uses them today). If no `--topbar-h` token exists, measure the Topbar height (grep `Topbar.jsx` for its height) and hardcode `calc(100vh - 64px)` accordingly. Below 1100px width add a fallback: wrap the two grids' style with `window.innerWidth`-independent CSS by adding `minWidth: 0` on tiles; page-level scroll on small screens is acceptable (`overflow: 'hidden auto'` via a `@media`-less inline compromise: set `overflowY: 'auto'` instead of `'hidden'` on the outer div). Chart height: give the intake-vs-termination `ResponsiveContainer` wrapper `height: '100%', minHeight: 150` instead of fixed 220.

- [ ] **Step 3: Sidebar** — delete the Schedule section + Calendar row from `NAV`:

```jsx
// remove these two lines
{ section: 'Schedule' },
{ to: '/schedule', label: 'Calendar', icon: 'calendar', roles: [...] },
```

Route `/schedule` in App.jsx stays (dashboard tiles + quick action navigate to it). Keep the "Calendar" quick-action button.

- [ ] **Step 4: Verify** — build; browser at 1280×800: dashboard fits with NO page scroll, every tile scrolls internally, mini calendar shows dots on appointment days (seed appointment exists on child 2), clicking it opens the full `/schedule` page, sidebar has no Calendar entry for any role (check all 3 accounts).

- [ ] **Step 5: Commit** — `feat(dashboard): no-scroll bento layout + clickable mini calendar; calendar leaves sidebar`

---

### Task 11: Backend — pin Ollama to the local machine (privacy hardening)

**Files:**
- Modify: `backend/ai/views.py` (`AISettingSerializer`, line ~25), `backend/config/settings.py`
- Modify: `frontend/src/pages/Settings.jsx` (hint copy)
- Test: append to an existing file in `backend/ai/tests/` (pick the one covering AISetting; else create `backend/ai/tests/test_settings_guard.py`)

**Why:** The DPA-compliance claim ("data never leaves the building") currently depends on an admin-editable URL that could silently point at a remote host. Enforce it.

- [ ] **Step 1: Failing test**

```python
# backend/ai/tests/test_settings_guard.py
from rest_framework.test import APITestCase
from accounts.models import Role
from children.tests.test_child_collab import make_user


class OllamaUrlGuardTests(APITestCase):
    def setUp(self):
        self.admin = make_user("ou@t.ph", Role.ADMINISTRATOR)
        self.client.force_authenticate(self.admin)

    def test_remote_url_rejected(self):
        r = self.client.patch("/api/ai/settings/", {"ollama_url": "http://203.0.113.5:11434"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_localhost_accepted(self):
        r = self.client.patch("/api/ai/settings/", {"ollama_url": "http://127.0.0.1:11434"}, format="json")
        self.assertEqual(r.status_code, 200)
```

(Check the actual settings endpoint path/method in `backend/ai/urls.py` first and adjust — it may be PUT on `/api/ai/settings/`.)

- [ ] **Step 2: Implement.** `backend/config/settings.py`: `ALLOW_REMOTE_OLLAMA = os.environ.get("ALLOW_REMOTE_OLLAMA", "false").lower() == "true"` (near the other env reads). `AISettingSerializer`:

```python
from urllib.parse import urlparse
from django.conf import settings as django_settings

    def validate_ollama_url(self, value):
        host = (urlparse(value).hostname or "").lower()
        if host in ("localhost", "127.0.0.1", "::1") or django_settings.ALLOW_REMOTE_OLLAMA:
            return value
        raise serializers.ValidationError(
            "AI must run on this machine (Data Privacy Act commitment). "
            "Use http://localhost:11434, or set ALLOW_REMOTE_OLLAMA=true in the "
            "server environment if the agency knowingly hosts Ollama elsewhere on-premises.")
```

`Settings.jsx`: under the Ollama URL input, set/extend the hint: "Must point to this machine (localhost) — child data never leaves RACCO I's hardware."

- [ ] **Step 3:** Full suite green; build.

- [ ] **Step 4: Commit** — `feat(ai): enforce localhost-only Ollama endpoint (DPA guarantee)`

---

## Self-Review (done at plan time)

- **Spec coverage:** psychologist edits assigned child → T1/T3; multidisciplinary "Google-Docs-like" collab → T2/T3 (scoped decision #1); calendar off sidebar + dashboard mini widget + click-to-fullscreen → T10; bento no-scroll dashboard + per-module scrolling → T10; grouped result entries per child → T9; terminated records archived for admin + reuse when a child returns → T4/T5; Previous Custodian / Address / Recommendation → T6; instrument module inside pre-assessment step 4 → T7/T8; new instrument title lists (children + PAP) → T7; ethical-consideration check → answered in chat + hardening T11.
- **Known ambiguities intentionally flagged:** decisions #1–#5 at the top; confirm with the user before executing if any look wrong.
- **Type consistency:** `expected_updated_at` (write-only, ISO string) and `updated_at` (read-only) used consistently across T1–T3; `terminations` list shape identical in T4 backend and T5 frontend; `audience` values `child|adoptive_parent|both` identical in T7 model, seed, and T8 filters; `InstrumentFormDrawer` props match both call sites.
- **Execution order:** T1→T2→T3 sequential; T4→T5 sequential; T7→T8 sequential; T6, T9, T10, T11 independent. Do T10 last if the in-flight Sidebar change hasn't landed yet.
