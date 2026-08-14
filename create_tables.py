from app.core.database import Base, engine
from app.models import Event, RestrictedZone


Base.metadata.create_all(bind=engine)

print("Database tables created successfully!")