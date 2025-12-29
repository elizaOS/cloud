#!/usr/bin/env bun
/**
 * DWS Logs Script
 *
 * Streams logs from DWS deployments.
 */

const DWS_API_URL = process.env.DWS_API_URL ?? 'http://localhost:4030'
const DEPLOYMENT_ID = process.argv[2]

async function streamLogs(): Promise<void> {
  if (!DEPLOYMENT_ID) {
    console.error('Usage: bun run dws:logs <deployment-id>')
    console.error('')
    console.error('Get deployment ID with: bun run dws:status')
    process.exit(1)
  }
  
  console.log(`Streaming logs for deployment: ${DEPLOYMENT_ID}`)
  console.log('Press Ctrl+C to stop')
  console.log('')
  
  const response = await fetch(
    `${DWS_API_URL}/deploy/${DEPLOYMENT_ID}/logs?follow=true&tail=100`,
  )
  
  if (!response.ok) {
    throw new Error(`Failed to get logs: ${response.status}`)
  }
  
  if (!response.body) {
    throw new Error('No response body')
  }
  
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n')
    
    for (const line of lines) {
      if (!line.trim()) continue
      
      try {
        const entry = JSON.parse(line)
        const timestamp = new Date(entry.timestamp).toISOString()
        const level = entry.level?.toUpperCase() ?? 'INFO'
        const message = entry.message ?? entry.msg ?? line
        
        // Color based on level
        let color = '\x1b[0m' // reset
        if (level === 'ERROR') color = '\x1b[31m' // red
        else if (level === 'WARN') color = '\x1b[33m' // yellow
        else if (level === 'DEBUG') color = '\x1b[90m' // gray
        
        console.log(`${color}[${timestamp}] [${level}] ${message}\x1b[0m`)
      } catch {
        // Plain text log
        console.log(line)
      }
    }
  }
}

streamLogs().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})


