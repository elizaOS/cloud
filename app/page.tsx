import Link from 'next/link';
import { getSignInUrl, getSignUpUrl, withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import LandingHeader from '@/components/layout/landing-header';
import { 
  Zap, 
  Cloud, 
  Code, 
  Rocket, 
  Shield, 
  Database,
  Cpu,
  Globe,
  ArrowRight,
  Brain,
  Server
} from 'lucide-react';

export default async function Home() {
  // Check if user is already signed in
  const { user } = await withAuth();
  
  // If signed in, redirect to dashboard
  if (user) {
    redirect('/dashboard');
  }

  // Get auth URLs for sign in/up
  const signInUrl = await getSignInUrl();
  const signUpUrl = await getSignUpUrl();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <LandingHeader signInUrl={signInUrl} signUpUrl={signUpUrl} />

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:px-6 md:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-sm">
            <Brain className="h-4 w-4" />
            <span>The Future of AI Agent Development</span>
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            Build, Deploy & Scale
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Intelligent AI Agents
            </span>
          </h1>
          <p className="mb-8 text-lg text-muted-foreground md:text-xl">
            Complete AI agent development platform with inference, hosting, storage, and rapid deployment. 
            Build powerful autonomous agents with ease.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild className="gap-2">
              <Link href={signUpUrl}>
                Start Building Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={signInUrl}>Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t bg-muted/30 py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Everything You Need to Build AI Agents
            </h2>
            <p className="text-lg text-muted-foreground">
              A complete platform for developing, deploying, and managing AI agents at scale
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <Brain className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Advanced AI Models</CardTitle>
                <CardDescription>
                  Access to cutting-edge LLMs including GPT-4, Claude, and open-source models. 
                  Built-in inference with automatic scaling.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Rocket className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Rapid Deployment</CardTitle>
                <CardDescription>
                  Deploy your AI agents in seconds. From development to production with a single command. 
                  Zero DevOps required.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Cloud className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Cloud-Native Hosting</CardTitle>
                <CardDescription>
                  Fully managed infrastructure with automatic scaling, load balancing, and 99.9% uptime SLA. 
                  Focus on building, not operations.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Database className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Persistent Storage</CardTitle>
                <CardDescription>
                  Built-in vector databases, memory management, and state persistence. 
                  Your agents remember conversations and learn over time.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Enterprise Security</CardTitle>
                <CardDescription>
                  End-to-end encryption, SOC 2 compliance, and granular access controls. 
                  Your data and agents are always secure.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Code className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Developer Experience</CardTitle>
                <CardDescription>
                  Intuitive CLI, TypeScript SDK, and extensive documentation. 
                  Build with the tools and languages you already know.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Cpu className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Container Support</CardTitle>
                <CardDescription>
                  Deploy custom containers with your own dependencies and runtime. 
                  Full control over your agent environment.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Zap className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Real-Time Analytics</CardTitle>
                <CardDescription>
                  Monitor agent performance, track usage metrics, and optimize costs. 
                  Comprehensive insights into your AI operations.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Globe className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Multi-Platform Support</CardTitle>
                <CardDescription>
                  Deploy agents to Discord, Telegram, Twitter, and more. 
                  One codebase, multiple platforms.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Powering the Next Generation of AI Applications
            </h2>
            <p className="text-lg text-muted-foreground">
              From customer service to autonomous trading bots
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Customer Support Agents</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Build intelligent chatbots that understand context, remember conversations, 
                  and provide personalized support 24/7. Reduce support costs while improving customer satisfaction.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Autonomous Trading Bots</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Create sophisticated agents that analyze market data, execute trades, 
                  and manage portfolios. Built-in blockchain integrations for DeFi and crypto trading.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Content Creation Agents</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Deploy agents that generate social media content, write articles, create images, 
                  and manage your online presence. Maintain consistent brand voice across platforms.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Research & Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Build agents that gather information, analyze data, generate reports, 
                  and provide insights. Automate research workflows and knowledge management.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t bg-primary py-20 text-primary-foreground">
        <div className="container mx-auto px-4 text-center md:px-6">
          <Server className="mx-auto mb-6 h-12 w-12" />
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Ready to Build Your AI Agent?
          </h2>
          <p className="mb-8 text-lg opacity-90">
            Join thousands of developers building the future of autonomous AI
          </p>
          <Button size="lg" variant="secondary" asChild className="gap-2">
            <Link href={signUpUrl}>
              Get Started for Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground md:px-6">
          <p>&copy; 2025 ElizaOS Cloud. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
