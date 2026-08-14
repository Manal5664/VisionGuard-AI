from app.core.database import SessionLocal
from app.models.event import Event


db = SessionLocal()

event = Event(
    event_type="detection",
    object_type="person",
    confidence=0.94,
    image_path="test.jpg",
)

db.add(event)
db.commit()
db.refresh(event)

print("Event saved successfully!")
print("Event ID:", event.id)

db.close()