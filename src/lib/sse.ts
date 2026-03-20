const encoder = new TextEncoder();

// Map<userId, Set<ReadableStreamDefaultController>>
// Using Set to support multiple tabs/windows per user
const sseConnections = new Map<string, Set<ReadableStreamDefaultController>>();

export function registerSSEConnection(userId: string, controller: ReadableStreamDefaultController): void {
  let controllers = sseConnections.get(userId);
  if (!controllers) {
    controllers = new Set();
    sseConnections.set(userId, controllers);
  }
  controllers.add(controller);
}

export function removeSSEConnection(userId: string, controller: ReadableStreamDefaultController): void {
  const controllers = sseConnections.get(userId);
  if (controllers) {
    controllers.delete(controller);
    if (controllers.size === 0) {
      sseConnections.delete(userId);
    }
  }
}

export function pushToSSE(userId: string, data: unknown): void {
  const controllers = sseConnections.get(userId);
  if (!controllers) return;
  const message = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  for (const controller of controllers) {
    try {
      controller.enqueue(message);
    } catch {
      // Controller closed, will be cleaned up on abort
    }
  }
}

export function pushToSSEMultiple(userIds: string[], data: unknown): void {
  for (const userId of userIds) {
    pushToSSE(userId, data);
  }
}
