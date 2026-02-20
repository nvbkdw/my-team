import type { Card, CardStatus } from './models.js';

/** Server-to-client WebSocket message types */
export type WsServerMessage =
  | { type: 'card:created'; payload: Card }
  | { type: 'card:updated'; payload: Card }
  | { type: 'card:moved'; payload: { id: string; status: CardStatus; position: number } }
  | { type: 'card:deleted'; payload: { id: string } }
  | { type: 'chat:message'; payload: { session_id: string; role: string; content: string } }
  | { type: 'branch:created'; payload: { card_id: string; branch_name: string } }
  | { type: 'pr:updated'; payload: { card_id: string; pr_url: string; pr_state: string } }
  | { type: 'error'; payload: { message: string } };

/** Client-to-server WebSocket message types */
export type WsClientMessage =
  | { type: 'subscribe'; payload: { card_id: string } }
  | { type: 'unsubscribe'; payload: { card_id: string } };
