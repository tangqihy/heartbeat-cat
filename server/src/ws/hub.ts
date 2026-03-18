import type { WebSocket } from 'ws'
import { stmts } from '../db/index'

// ── Types ──

export interface WsMessage {
  type: string
  [key: string]: unknown
}

interface ConnectedUser {
  userId: string
  socket: WebSocket
  displayName: string
}

// ── State ──

const onlineUsers = new Map<string, ConnectedUser>()

// ── Public API ──

export function addUser(userId: string, displayName: string, socket: WebSocket): void {
  onlineUsers.set(userId, { userId, socket, displayName })

  // Notify this user about which friends are online
  const friendIds = getOnlineFriendIds(userId)
  const friendsOnline = friendIds.map(id => {
    const u = onlineUsers.get(id)!
    return { id, display_name: u.displayName }
  })
  send(socket, { type: 'friends_online', friends: friendsOnline })

  // Notify each online friend that this user just came online
  for (const fid of friendIds) {
    const friend = onlineUsers.get(fid)
    if (friend) {
      send(friend.socket, { type: 'friend_online', friend_id: userId, display_name: displayName })
    }
  }
}

export function removeUser(userId: string): void {
  onlineUsers.delete(userId)

  // Notify friends this user went offline
  const friendIds = getOnlineFriendIds(userId)
  for (const fid of friendIds) {
    const friend = onlineUsers.get(fid)
    if (friend) {
      send(friend.socket, { type: 'friend_offline', friend_id: userId })
    }
  }
}

export function handleMessage(userId: string, msg: WsMessage): void {
  switch (msg.type) {
    case 'input_event':
      broadcastToFriends(userId, {
        type: 'friend_input',
        friend_id: userId,
        input_type: msg.input_type,
      })
      break

    case 'equip_change':
      broadcastToFriends(userId, {
        type: 'friend_equip',
        friend_id: userId,
        slot: msg.slot,
        item_id: msg.item_id,
        svg_ref: msg.svg_ref,
      })
      break

    default:
      break
  }
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId)
}

export function broadcastToUser(userId: string, msg: WsMessage): void {
  const user = onlineUsers.get(userId)
  if (user) send(user.socket, msg)
}

// ── Internals ──

function getOnlineFriendIds(userId: string): string[] {
  const rows = stmts.getFriends.all({ user_id: userId }) as Array<{ friend_id: string }>
  return rows
    .map(r => r.friend_id)
    .filter(fid => onlineUsers.has(fid))
}

function broadcastToFriends(userId: string, msg: WsMessage): void {
  const friendIds = getOnlineFriendIds(userId)
  for (const fid of friendIds) {
    const friend = onlineUsers.get(fid)
    if (friend) {
      send(friend.socket, msg)
    }
  }
}

function send(socket: WebSocket, data: WsMessage): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(data))
  }
}
