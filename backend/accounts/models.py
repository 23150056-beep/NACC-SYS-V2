from django.contrib.auth.models import AbstractUser
from django.db import models

from accounts.managers import UserManager


class Role(models.Model):
    ADMINISTRATOR = "Administrator"
    PSYCHOLOGIST = "Psychologist"
    STAFF = "Staff"

    role_name = models.CharField(max_length=50, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_role"

    def __str__(self):
        return self.role_name


class User(AbstractUser):
    ACTIVE = "active"
    ARCHIVED = "archived"
    STATUS_CHOICES = [(ACTIVE, "Active"), (ARCHIVED, "Archived")]

    email = models.EmailField(unique=True)
    middle_initial = models.CharField(max_length=5, blank=True)
    contact_details = models.CharField(max_length=50, blank=True)
    role = models.ForeignKey(
        Role, on_delete=models.PROTECT, null=True, blank=True, related_name="users"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    objects = UserManager()

    class Meta:
        db_table = "tbl_user"

    @property
    def fullname(self):
        parts = [self.first_name, self.middle_initial, self.last_name]
        return " ".join(p for p in parts if p)

    def __str__(self):
        return self.email
