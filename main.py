from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import json

from database import get_db, engine, Base
from models import User, Family, Item

# WebSocket Connection Manager for real-time sync
class ConnectionManager:
    def __init__(self):
        # Map family_id -> list of (user_id, websocket)
        self.active_connections: Dict[int, List[tuple]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int, family_id: int):
        await websocket.accept()
        if family_id not in self.active_connections:
            self.active_connections[family_id] = []
        self.active_connections[family_id].append((user_id, websocket))
    
    def disconnect(self, user_id: int, family_id: int):
        if family_id in self.active_connections:
            self.active_connections[family_id] = [
                (uid, ws) for uid, ws in self.active_connections[family_id] 
                if uid != user_id
            ]
            if not self.active_connections[family_id]:
                del self.active_connections[family_id]
    
    async def broadcast_to_family(self, family_id: int, message: dict, exclude_user_id: int = None):
        """Broadcast message to all family members except the sender"""
        if family_id not in self.active_connections:
            return
        for uid, ws in self.active_connections[family_id]:
            if uid != exclude_user_id:
                try:
                    await ws.send_json(message)
                except:
                    pass  # Connection might be closed

manager = ConnectionManager()

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
    # 1. Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. Separate migration steps for new columns
    try:
        async with engine.connect() as conn:
            # Add last_seen column if not exists
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITHOUT TIME ZONE;"))
            # Add owner_id column if not exists
            await conn.execute(text("ALTER TABLE families ADD COLUMN IF NOT EXISTS owner_id BIGINT;"))
            # Add visit_count column if not exists
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;"))
            await conn.commit()
    except Exception as e:
        # Ignore error if columns exist or other non-critical migration issue
        print(f"Migration warning (non-critical): {e}")

@app.post("/api/auth")
async def auth_user(user_data: UserAuth, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.telegram_id == user_data.id))
    user = result.scalar_one_or_none()
    
    current_time = datetime.utcnow()

    if not user:
        # Create new family for new user (user becomes owner)
        new_family = Family(owner_id=user_data.id)
        db.add(new_family)
        await db.commit()
        await db.refresh(new_family)

        user = User(
            telegram_id=user_data.id,
            username=user_data.username,
            photo_url=user_data.photo_url,
            family_id=new_family.id,
            last_seen=current_time,
            visit_count=1
        )
        db.add(user)
        await db.commit()
    else:
        # Update user info if changed
        if user.username != user_data.username:
            user.username = user_data.username
        if user.photo_url != user_data.photo_url:
            user.photo_url = user_data.photo_url
        
        # Increment visit count
        user.visit_count = (user.visit_count or 0) + 1
        
        # Update last_seen
        user.last_seen = current_time
        await db.commit()
    
    # Reload user with family and family members
    result = await db.execute(
        select(User)
        .where(User.telegram_id == user_data.id)
        .options(selectinload(User.family).selectinload(Family.users))
    )
    user = result.scalar_one()
    
    # Determine if current user is the family owner
    is_owner = user.family.owner_id == user.telegram_id
    
    # Serialize the response properly
    return {
        "status": "ok", 
        "user": {
            "telegram_id": user.telegram_id,
            "username": user.username,
            "photo_url": user.photo_url,
            "family_id": user.family_id,
        },
        "family": {
            "id": user.family.id,
            "invite_code": user.family.invite_code,
            "owner_id": user.family.owner_id,
            "is_owner": is_owner,
            "members": [
                {
                    "telegram_id": m.telegram_id,
                    "username": m.username,
                    "photo_url": m.photo_url
                }
                for m in user.family.users
            ]
        }
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
            "photo_url": u.photo_url,
            "last_seen": u.last_seen.isoformat() if u.last_seen else None,
            "is_online": is_online,
            "family_id": u.family_id,
            "visit_count": u.visit_count or 0
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
            "owner_id": family.owner_id,
            "is_owner": family.owner_id == join_req.user_id,
            "members": [
                {
                    "telegram_id": m.telegram_id,
                    "username": m.username,
                    "photo_url": m.photo_url
                }
                for m in members
            ]
        }
    }

class LeaveRequest(BaseModel):
    user_id: int

@app.post("/api/leave")
async def leave_family(leave_req: LeaveRequest, db: AsyncSession = Depends(get_db)):
    """User leaves their current family and gets a new one."""
    # Find user
    result = await db.execute(select(User).where(User.telegram_id == leave_req.user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    old_family_id = user.family_id
    
    # Create new family for the user (user becomes owner)
    new_family = Family(owner_id=leave_req.user_id)
    db.add(new_family)
    await db.commit()
    await db.refresh(new_family)
    
    # Move user to new family
    user.family_id = new_family.id
    await db.commit()
    
    # If old family is now empty, we could delete it (optional cleanup)
    # For now we leave it as is
    
    return {
        "status": "success",
        "family": {
            "id": new_family.id,
            "invite_code": new_family.invite_code,
            "owner_id": new_family.owner_id,
            "is_owner": True,
            "members": [
                {
                    "telegram_id": user.telegram_id,
                    "username": user.username,
                    "photo_url": user.photo_url
                }
            ]
        }
    }

class RemoveMemberRequest(BaseModel):
    owner_id: int
    target_user_id: int

@app.post("/api/remove-member")
async def remove_member(remove_req: RemoveMemberRequest, db: AsyncSession = Depends(get_db)):
    """Owner removes a member from the family."""
    # Find owner
    owner_result = await db.execute(
        select(User)
        .where(User.telegram_id == remove_req.owner_id)
        .options(selectinload(User.family))
    )
    owner = owner_result.scalar_one_or_none()
    
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    # Check if requester is actually the owner
    if owner.family.owner_id != remove_req.owner_id:
        raise HTTPException(status_code=403, detail="Only the family owner can remove members")
    
    # Can't remove yourself
    if remove_req.owner_id == remove_req.target_user_id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself. Use /api/leave instead.")
    
    # Find target user
    target_result = await db.execute(select(User).where(User.telegram_id == remove_req.target_user_id))
    target_user = target_result.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")
    
    if target_user.family_id != owner.family_id:
        raise HTTPException(status_code=400, detail="User is not in your family")
    
    # Create new family for removed user
    new_family = Family(owner_id=remove_req.target_user_id)
    db.add(new_family)
    await db.commit()
    await db.refresh(new_family)
    
    # Move target user to new family
    target_user.family_id = new_family.id
    await db.commit()
    
    # Get updated members of owner's family
    members_result = await db.execute(select(User).where(User.family_id == owner.family_id))
    members = members_result.scalars().all()
    
    return {
        "status": "success",
        "family": {
            "id": owner.family.id,
            "invite_code": owner.family.invite_code,
            "owner_id": owner.family.owner_id,
            "is_owner": True,
            "members": [
                {
                    "telegram_id": m.telegram_id,
                    "username": m.username,
                    "photo_url": m.photo_url
                }
                for m in members
            ]
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
    
    # Serialize items
    return [
        {
            "id": item.id,
            "text": item.text,
            "is_bought": item.is_bought,
            "category": item.category
        }
        for item in items
    ]

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
        action = "item_updated"
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
        action = "item_added"
    
    await db.commit()
    
    # Broadcast to family members
    await manager.broadcast_to_family(user.family_id, {
        "type": action,
        "item": {
            "id": item_data.id,
            "text": item_data.text,
            "is_bought": item_data.is_bought,
            "category": item_data.category
        }
    }, exclude_user_id=item_data.user_id)
    
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
        family_id = item.family_id
        await db.delete(item)
        await db.commit()
        
        # Broadcast deletion to family
        await manager.broadcast_to_family(family_id, {
            "type": "item_deleted",
            "item_id": item_id
        }, exclude_user_id=user_id)
        
        return {"status": "deleted"}
    
    raise HTTPException(status_code=403, detail="Not authorized")

# WebSocket endpoint for real-time sync
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    # Get user's family_id from database
    from database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            await websocket.close(code=4001)
            return
        family_id = user.family_id
    
    await manager.connect(websocket, user_id, family_id)
    try:
        while True:
            # Keep connection alive, receive messages (ping/pong)
            data = await websocket.receive_text()
            # Echo back for ping/pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(user_id, family_id)
    except Exception as e:
        print(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(user_id, family_id)

# Serve SPA
app.mount("/", StaticFiles(directory="dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
