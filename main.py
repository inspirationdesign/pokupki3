from fastapi import FastAPI, Depends, HTTPException, status
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List, Optional
import os

from database import get_db, engine, Base
from models import User, Family, Item

app = FastAPI()

# CORS
origins = ["*"]  # For development; restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class UserAuth(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None

class JoinRequest(BaseModel):
    invite_code: str
    user_id: int

class ItemCreate(BaseModel):
    id: str
    text: str
    is_bought: bool
    category: str
    user_id: int # To identify who is adding/modifying (and thus which family)

class ItemUpdate(BaseModel):
    text: Optional[str] = None
    is_bought: Optional[bool] = None
    category: Optional[str] = None

# Routes

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Auto-migration for existing users table to add last_seen column
        try:
             # Check if last_seen column exists (PostgreSQL specific check)
             await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITHOUT TIME ZONE;"))
        except Exception as e:
            print(f"Migration warning: {e}")

@app.post("/api/auth")
async def auth_user(user_data: UserAuth, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.telegram_id == user_data.id))
    user = result.scalar_one_or_none()
    
    current_time = datetime.utcnow()

    if not user:
        # Create new family for new user
        new_family = Family()
        db.add(new_family)
        await db.commit()
        await db.refresh(new_family)

        user = User(
            telegram_id=user_data.id,
            username=user_data.username,
            photo_url=user_data.photo_url,
            family_id=new_family.id,
            last_seen=current_time
        )
        db.add(user)
        await db.commit()
    else:
        # Update user info if changed
        if user.username != user_data.username:
            user.username = user_data.username
        if user.photo_url != user_data.photo_url:
            user.photo_url = user_data.photo_url
        
        # Update last_seen
        user.last_seen = current_time
        await db.commit()
    
    # Reload user with family
    result = await db.execute(select(User).where(User.telegram_id == user_data.id).options(selectinload(User.family)))
    user = result.scalar_one()
    
    return {
        "status": "ok", 
        "user": user, 
        "family": user.family
    }

@app.get("/api/admin/stats")
async def admin_stats(admin_user_id: int, db: AsyncSession = Depends(get_db)):
    # Simple security check - only allow the specific admin user
    # Ideally should be an environment variable or DB role, but hardcoding as requested
    # @v_chernyshov ID would be needed here, or check username
    
    # Check if requester is admin
    result = await db.execute(select(User).where(User.telegram_id == admin_user_id))
    requester = result.scalar_one_or_none()
    
    if not requester or requester.username != "v_chernyshov":
         raise HTTPException(status_code=403, detail="Access denied")

    # Fetch all users
    result = await db.execute(select(User).options(selectinload(User.family)))
    users = result.scalars().all()
    
    stats = []
    for u in users:
        is_online = False
        if u.last_seen:
             # Consider online if seen in last 5 minutes
             is_online = (datetime.utcnow() - u.last_seen).total_seconds() < 300
             
        stats.append({
            "id": u.telegram_id,
            "username": u.username,
            "first_name": "Unknown", # We assume frontend passes names or we store them. Model only has username.
            "last_seen": u.last_seen,
            "is_online": is_online,
            "family_id": u.family_id
        })
        
    return stats

@app.post("/api/join")
async def join_family(join_req: JoinRequest, db: AsyncSession = Depends(get_db)):
    # Find family by code
    result = await db.execute(select(Family).where(Family.invite_code == join_req.invite_code))
    family = result.scalar_one_or_none()
    
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    # Find user
    user_result = await db.execute(select(User).where(User.telegram_id == join_req.user_id))
    user = user_result.scalar_one_or_none()

    if not user:
         raise HTTPException(status_code=404, detail="User not found")

    user.family_id = family.id
    await db.commit()
    
    # Get Updated Members
    members_result = await db.execute(select(User).where(User.family_id == family.id))
    members = members_result.scalars().all()

    return {
         "status": "success",
         "family": {
            "id": family.id,
            "invite_code": family.invite_code,
            "members": members
        }
    }

@app.get("/api/items")
async def get_items(user_id: int, db: AsyncSession = Depends(get_db)):
    # Get user to find family
    result = await db.execute(select(User).where(User.telegram_id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    items_result = await db.execute(select(Item).where(Item.family_id == user.family_id))
    items = items_result.scalars().all()
    
    return items

@app.post("/api/items")
async def create_or_update_item(item_data: ItemCreate, db: AsyncSession = Depends(get_db)):
    # Get user to find family
    result = await db.execute(select(User).where(User.telegram_id == item_data.user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if item exists
    item_result = await db.execute(select(Item).where(Item.id == item_data.id))
    existing_item = item_result.scalar_one_or_none()

    if existing_item:
        # Update
        existing_item.text = item_data.text
        existing_item.is_bought = item_data.is_bought
        existing_item.category = item_data.category
        # Ensure family ID is consistent if needed, but usually item stays in family
    else:
        # Create
        new_item = Item(
            id=item_data.id,
            text=item_data.text,
            is_bought=item_data.is_bought,
            category=item_data.category,
            family_id=user.family_id
        )
        db.add(new_item)
    
    await db.commit()
    return {"status": "ok"}

@app.delete("/api/items/{item_id}")
async def delete_item(item_id: str, user_id: int, db: AsyncSession = Depends(get_db)):
    # Verify user belongs to the family of the item
    # Fetch item
    item_result = await db.execute(select(Item).where(Item.id == item_id))
    item = item_result.scalar_one_or_none()
    
    if not item:
        return {"status": "not found"} # Idempotent

    # Fetch user
    user_result = await db.execute(select(User).where(User.telegram_id == user_id))
    user = user_result.scalar_one_or_none()

    if user and user.family_id == item.family_id:
        await db.delete(item)
        await db.commit()
        return {"status": "deleted"}
    
    raise HTTPException(status_code=403, detail="Not authorized")

# Serve SPA
app.mount("/", StaticFiles(directory="dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
