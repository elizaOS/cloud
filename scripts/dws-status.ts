#!/usr/bin/env bun
/**
 * DWS Status Script
 *
 * Shows the current status of DWS deployments.
 */

const DWS_API_URL = process.env.DWS_API_URL ?? 'http://localhost:4030'
const DWS_NETWORK = process.env.DWS_NETWORK ?? 'localnet'

interface DeploymentInfo {
  deploymentId: string
  name: string
  workerUrl: string
  staticUrl: string
  status: string
  regions: string[]
  createdAt: string
  updatedAt: string
  metrics?: {
    requests: number
    errors: number
    p50Latency: number
    p99Latency: number
  }
}

async function getDeployments(): Promise<DeploymentInfo[]> {
  const response = await fetch(`${DWS_API_URL}/deploy/list?app=eliza-cloud`)
  
  if (!response.ok) {
    throw new Error(`Failed to list deployments: ${response.status}`)
  }
  
  return response.json()
}

async function main(): Promise<void> {
  console.log('DWS Status')
  console.log('==========')
  console.log('')
  console.log(`Network: ${DWS_NETWORK}`)
  console.log(`API URL: ${DWS_API_URL}`)
  console.log('')
  
  const deployments = await getDeployments()
  
  if (deployments.length === 0) {
    console.log('No deployments found.')
    return
  }
  
  console.log('Deployments:')
  console.log('')
  
  for (const d of deployments) {
    console.log(`  ${d.name}`)
    console.log(`    ID:      ${d.deploymentId}`)
    console.log(`    Status:  ${d.status}`)
    console.log(`    URL:     ${d.workerUrl}`)
    console.log(`    Regions: ${d.regions.join(', ')}`)
    console.log(`    Created: ${d.createdAt}`)
    
    if (d.metrics) {
      console.log(`    Metrics:`)
      console.log(`      Requests: ${d.metrics.requests}`)
      console.log(`      Errors:   ${d.metrics.errors}`)
      console.log(`      P50:      ${d.metrics.p50Latency}ms`)
      console.log(`      P99:      ${d.metrics.p99Latency}ms`)
    }
    
    console.log('')
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})


