from datetime import datetime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    designs: Mapped[list["Design"]] = relationship(back_populates="owner")

class Template(Base):
    __tablename__ = "templates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    thumbnail_url: Mapped[str] = mapped_column(String(500))
    image_url: Mapped[str] = mapped_column(String(500))
    width: Mapped[int] = mapped_column(Integer, default=1200)
    height: Mapped[int] = mapped_column(Integer, default=1800)

class Design(Base):
    __tablename__ = "designs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    template_id: Mapped[int] = mapped_column(ForeignKey("templates.id"))
    title: Mapped[str] = mapped_column(String(200))
    fabric_json: Mapped[str] = mapped_column(Text)
    rsvp_fabric_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped[User] = relationship(back_populates="designs")
    responses: Mapped[list["InvitationResponse"]] = relationship(
        back_populates="design", cascade="all, delete-orphan"
    )


class InvitationResponse(Base):
    __tablename__ = "invitation_responses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    design_id: Mapped[int] = mapped_column(ForeignKey("designs.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(50))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    design: Mapped[Design] = relationship(back_populates="responses")
