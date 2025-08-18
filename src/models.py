from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Agent(Base):
    __tablename__ = 'agents'
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)
    type = Column(String)
    status = Column(String)
    last_active = Column(DateTime, default=datetime.utcnow)
    config = Column(JSON)
    is_running = Column(Boolean, default=True)

class Task(Base):
    __tablename__ = 'tasks'
    id = Column(Integer, primary_key=True)
    agent_id = Column(Integer)
    type = Column(String)
    status = Column(String)
    result = Column(JSON)
    error = Column(String)
    completed_at = Column(DateTime, default=datetime.utcnow)
