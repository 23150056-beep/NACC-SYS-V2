from rest_framework.permissions import BasePermission, SAFE_METHODS
from accounts.models import Role


def _role_name(request):
    role = getattr(request.user, "role", None)
    return role.role_name if role else None


class IsAdministrator(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and _role_name(request) == Role.ADMINISTRATOR)


class IsAdminOrStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and _role_name(request) in (Role.ADMINISTRATOR, Role.STAFF))


class RecordsAccess(BasePermission):
    """Read access for Admin/Staff/Psychologist; write access for Admin/Staff only.

    Psychologists can VIEW child/guardian records (per the RBAC matrix) but cannot
    create, edit, archive, or delete them. Per-psychologist "assigned only" filtering
    is deferred to Phase 2 (when assessments establish the assignment link).
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        role = _role_name(request)
        if request.method in SAFE_METHODS:
            return role in (Role.ADMINISTRATOR, Role.STAFF, Role.PSYCHOLOGIST)
        return role in (Role.ADMINISTRATOR, Role.STAFF)


# Roles allowed to manage assessment instruments (questionnaires).
# Capstone RBAC matrix = Admin-only; Psychologist added per product decision 2026-06-27.
# TO REVERT to the capstone rule: remove Role.PSYCHOLOGIST from this tuple.
INSTRUMENT_MANAGER_ROLES = (Role.ADMINISTRATOR, Role.PSYCHOLOGIST)


class CanManageInstruments(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and _role_name(request) in INSTRUMENT_MANAGER_ROLES)


# Roles allowed to take/administer assessments. Psychologist-only: a psychologist
# may only assess children assigned to them using instruments they own.
ASSESSMENT_TAKER_ROLES = (Role.PSYCHOLOGIST,)


class CanTakeAssessments(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and _role_name(request) in ASSESSMENT_TAKER_ROLES)


# Roles allowed to VIEW assessment results (read-only). Staff is included for
# case coordination; creating/running assessments stays ASSESSMENT_TAKER_ROLES.
RESULT_VIEWER_ROLES = (Role.ADMINISTRATOR, Role.PSYCHOLOGIST, Role.STAFF)


class CanViewResults(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and _role_name(request) in RESULT_VIEWER_ROLES)


class ProgressRecordAccess(BasePermission):
    """Progress log & goals. Read: admin/staff/psychologist. Write: admin or the
    child's assigned psychologist (Staff read-only). Object-level restricts a
    psychologist to their assigned children's records."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        role = _role_name(request)
        if request.method in SAFE_METHODS:
            return role in (Role.ADMINISTRATOR, Role.STAFF, Role.PSYCHOLOGIST)
        return role in (Role.ADMINISTRATOR, Role.PSYCHOLOGIST)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        role = _role_name(request)
        if role == Role.ADMINISTRATOR:
            return True
        return obj.child.assigned_psychologist_id == request.user.id
