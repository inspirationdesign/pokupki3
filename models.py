from sqlalchemy import Column, Integer, String, BigInteger, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship
from database import Base
import uuid

def generate_invite_code():
    return str(uuid.uuid4())[:8]

class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    invite_code = Column(String, unique=True, index=True, default=generate_invite_code)

    users = relationship("User", back_populates="family")
    items = relationship("Item", back_populates="family")

class User(Base):
    __tablename__ = "users"

    telegram_id = Column(BigInteger, primary_key=True, index=True)
    username = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    family_id = Column(Integer, ForeignKey("families.id"))
    last_seen = Column(DateTime, nullable=True)

    family = relationship("Family", back_populates="users")

class Item(Base):
    __tablename__ = "items"

    id = Column(String, primary_key=True, index=True) # Keeping string ID to match frontend UUID usage
    text = Column(String, index=True)
    is_bought = Column(Boolean, default=False)
    category = Column(String, default="dept_none")
    family_id = Column(Integer, ForeignKey("families.id"))

    family = relationship("Family", back_populates="items")
