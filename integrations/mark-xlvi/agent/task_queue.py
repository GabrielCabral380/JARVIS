"""
JARVIS Task Queue
=================
Priority task queue with concurrency control and cancellation.
"""

import json
import threading
import time
from enum import IntEnum
from pathlib import Path
from datetime import datetime


class Priority(IntEnum):
    LOW = 1
    NORMAL = 5
    HIGH = 10


class TaskStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Task:
    def __init__(self, name: str, action: dict, priority: Priority = Priority.NORMAL,
                 on_complete=None, on_fail=None):
        self.id = f"task_{int(time.time()*1000)}_{id(self) % 10000}"
        self.name = name
        self.action = action  # {"tool": "...", "args": {...}}
        self.priority = priority
        self.status = TaskStatus.PENDING
        self.result = None
        self.error = None
        self.created_at = datetime.now().isoformat()
        self.completed_at = None
        self.on_complete = on_complete
        self.on_fail = on_fail

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "action": self.action,
            "priority": int(self.priority),
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }


class TaskQueue:
    def __init__(self, max_concurrent: int = 1):
        self._queue = []  # List of Task, sorted by priority
        self._lock = threading.Lock()
        self._running = set()
        self._max_concurrent = max_concurrent
        self._cancel_event = threading.Event()
        self._history = []

    def submit(self, task: Task) -> str:
        """Add a task to the queue. Returns task ID."""
        with self._lock:
            self._queue.append(task)
            self._queue.sort(key=lambda t: t.priority, reverse=True)
        return task.id

    def submit_simple(self, name: str, tool: str, args: dict | None = None,
                      priority: Priority = Priority.NORMAL) -> str:
        """Simple task submission."""
        task = Task(
            name=name,
            action={"tool": tool, "args": args or {}},
            priority=priority
        )
        return self.submit(task)

    def cancel(self, task_id: str) -> bool:
        """Cancel a pending or running task."""
        with self._lock:
            for t in self._queue:
                if t.id == task_id:
                    t.status = TaskStatus.CANCELLED
                    return True
        return False

    def cancel_all(self) -> int:
        """Cancel all pending tasks."""
        count = 0
        with self._lock:
            for t in self._queue:
                if t.status == TaskStatus.PENDING:
                    t.status = TaskStatus.CANCELLED
                    count += 1
        return count

    def get_next(self) -> Task | None:
        """Get the next task to execute."""
        with self._lock:
            if len(self._running) >= self._max_concurrent:
                return None
            for task in self._queue:
                if task.status == TaskStatus.PENDING:
                    task.status = TaskStatus.RUNNING
                    self._running.add(task.id)
                    return task
            return None

    def complete(self, task_id: str, result: str = ""):
        """Mark task as completed."""
        with self._lock:
            self._running.discard(task_id)
            for t in self._queue:
                if t.id == task_id:
                    t.status = TaskStatus.COMPLETED
                    t.result = result
                    t.completed_at = datetime.now().isoformat()
                    self._history.append(t)
                    if t.on_complete:
                        try:
                            t.on_complete(t, result)
                        except Exception:
                            pass
                    break

    def fail(self, task_id: str, error: str = ""):
        """Mark task as failed."""
        with self._lock:
            self._running.discard(task_id)
            for t in self._queue:
                if t.id == task_id:
                    t.status = TaskStatus.FAILED
                    t.error = error
                    t.completed_at = datetime.now().isoformat()
                    self._history.append(t)
                    if t.on_fail:
                        try:
                            t.on_fail(t, error)
                        except Exception:
                            pass
                    break

    def pending_count(self) -> int:
        with self._lock:
            return sum(1 for t in self._queue if t.status == TaskStatus.PENDING)

    def running_count(self) -> int:
        return len(self._running)

    def list_tasks(self, status_filter: str = None) -> list:
        """Return tasks, optionally filtered by status."""
        with self._lock:
            tasks = self._queue + self._history
            if status_filter:
                tasks = [t for t in tasks if t.status == status_filter]
            return [t.to_dict() for t in tasks]

    def clear_history(self):
        """Clear completed/failed tasks from history."""
        with self._lock:
            self._history.clear()
            self._queue = [t for t in self._queue if t.status in (TaskStatus.PENDING, TaskStatus.RUNNING)]


# Global singleton
_global_queue = None
_global_lock = threading.Lock()


def get_task_queue(max_concurrent: int = 1) -> TaskQueue:
    """Get or create the global task queue."""
    global _global_queue
    with _global_lock:
        if _global_queue is None:
            _global_queue = TaskQueue(max_concurrent=max_concurrent)
        return _global_queue
