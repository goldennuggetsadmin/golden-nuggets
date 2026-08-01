"""Per-entity repository accessors — one place to change collection names."""
from .base import BaseRepository
from . import make_repo


def sermons_repo() -> BaseRepository:
    return make_repo("sermons")


def meetings_repo() -> BaseRepository:
    return make_repo("meetings")


def categories_repo() -> BaseRepository:
    return make_repo("categories")


def media_repo() -> BaseRepository:
    return make_repo("media_assets")


def users_repo() -> BaseRepository:
    return make_repo("users")


def settings_repo() -> BaseRepository:
    return make_repo("settings")


def activity_repo() -> BaseRepository:
    return make_repo("activity_log")


def home_repo() -> BaseRepository:
    return make_repo("home_config")


def notifications_repo() -> BaseRepository:
    return make_repo("notifications")


def analytics_repo() -> BaseRepository:
    return make_repo("mobile_events")


def login_attempts_repo() -> BaseRepository:
    return make_repo("login_attempts")
