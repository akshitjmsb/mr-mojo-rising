"""Source-grounded lesson contract. Missing musical information stays missing."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Evidence(Model):
    kind: Literal["transcript", "description", "visual", "audio"]
    at: float | None
    detail: str


class Fact(Model):
    value: str | None
    evidence: list[Evidence]
    review: str | None


class Chord(Model):
    name: str
    # High e, B, G, D, A, low E. null means UNKNOWN, not muted.
    frets: list[str | None] = Field(min_length=6, max_length=6)
    evidence: list[Evidence]
    review: str | None


class Note(Model):
    string: int = Field(ge=1, le=6)
    fret: int = Field(ge=0, le=24)
    slot: int = Field(ge=0, le=500)
    technique: Literal["", "h", "p", "/", "\\", "b", "r", "~", "x"]


class Phrase(Model):
    title: str
    start: float | None
    end: float | None
    notes: list[Note] = Field(max_length=600)
    evidence: list[Evidence]
    review: str | None


class Section(Model):
    title: str
    start: float | None
    end: float | None
    chords: list[Chord]
    strumming: Fact
    picking: Fact
    phrases: list[Phrase]
    tips: list[Fact]


class Metadata(Model):
    song: Fact
    artist: Fact
    tuning: Fact
    capo: Fact
    key: Fact
    level: Fact
    gear: Fact


class Resource(Model):
    title: str
    url: str
    evidence: str


class PlanSection(Model):
    title: str
    start: float | None
    end: float | None
    frames: list[float] = Field(max_length=12)


class Plan(Model):
    metadata: Metadata
    sections: list[PlanSection] = Field(min_length=1, max_length=32)
    songMap: Fact
    resources: list[Resource]


class Source(Model):
    url: str | None
    title: str
    channel: str | None
    duration: float | None
    captions: str


class Pack(Model):
    version: Literal[1]
    source: Source
    metadata: Metadata
    sections: list[Section]
    songMap: Fact
    resources: list[Resource]
    notices: list[str]
