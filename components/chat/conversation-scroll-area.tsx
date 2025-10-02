import * as React from "react"

interface ConversationScrollAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function ConversationScrollArea({ children, className = "" }: ConversationScrollAreaProps) {
  return (
    <div className={`overflow-y-auto ${className}`}>
      {children}
    </div>
  )
}
