import type { Metadata } from "next";
import { BrandCard, CornerBrackets } from "@/components/brand";
import LandingHeader from "@/components/layout/landing-header";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Privacy Policy",
  description:
    "Privacy Policy for elizaOS Platform - Learn how we collect, use, and protect your data.",
  path: "/privacy-policy",
  keywords: ["privacy policy", "data protection", "GDPR", "privacy", "elizaOS"],
});

/**
 * Privacy policy page displaying the platform's privacy policy and data handling practices.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden">
      {/* Header */}
      <LandingHeader />

      {/* Fullscreen background video */}
      <video
        src="/videos/Hero Cloud_x3 Slower_1_Scale 5.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: "brightness(0.4) blur(2px)",
        }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60" />

      <div className="relative z-10 flex flex-1 items-start justify-center p-4 py-12">
        <BrandCard className="w-full max-w-4xl backdrop-blur-sm bg-black/60">
          <CornerBrackets size="lg" className="opacity-50" />

          <div className="relative z-10 space-y-8">
            {/* Back button */}
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-[#FF5800] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>

            {/* Header */}
            <div className="space-y-3 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: "#FF5800" }}
                />
                <span className="text-white text-xl font-bold">ELIZA</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white">
                Privacy Policy
              </h1>
              <p className="text-base text-white/60">
                Last updated: November 4, 2025
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-invert max-w-none space-y-8">
              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  1. Introduction
                </h2>
                <p className="text-white/80 leading-relaxed">
                  Welcome to elizaOS (&quot;we&quot;, &quot;our&quot;, or
                  &quot;us&quot;). We are committed to protecting your personal
                  information and your right to privacy. This Privacy Policy
                  explains how we collect, use, disclose, and safeguard your
                  information when you use our Service.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  2. Information We Collect
                </h2>
                <p className="text-white/80 leading-relaxed">
                  We collect information that you provide directly to us when
                  you:
                </p>
                <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
                  <li>Create an account</li>
                  <li>Use our API services</li>
                  <li>Contact us for support</li>
                  <li>Subscribe to our newsletter or communications</li>
                  <li>Participate in surveys or promotions</li>
                </ul>
                <p className="text-white/80 leading-relaxed mt-4">
                  This information may include your name, email address, payment
                  information, and any other information you choose to provide.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  3. Automatically Collected Information
                </h2>
                <p className="text-white/80 leading-relaxed">
                  When you access our Service, we automatically collect certain
                  information about your device, including:
                </p>
                <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
                  <li>IP address and device identifiers</li>
                  <li>Browser type and version</li>
                  <li>Operating system</li>
                  <li>Access times and dates</li>
                  <li>Pages viewed and features used</li>
                  <li>API usage patterns and performance metrics</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  4. How We Use Your Information
                </h2>
                <p className="text-white/80 leading-relaxed">
                  We use the information we collect to:
                </p>
                <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
                  <li>Provide, maintain, and improve our Service</li>
                  <li>Process transactions and send related information</li>
                  <li>Send you technical notices and support messages</li>
                  <li>Respond to your comments and questions</li>
                  <li>Monitor and analyze trends, usage, and activities</li>
                  <li>
                    Detect, prevent, and address technical issues and fraud
                  </li>
                  <li>Comply with legal obligations</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  5. Information Sharing and Disclosure
                </h2>
                <p className="text-white/80 leading-relaxed">
                  We may share your information in the following circumstances:
                </p>
                <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
                  <li>
                    With service providers who perform services on our behalf
                  </li>
                  <li>When required by law or to respond to legal process</li>
                  <li>
                    To protect the rights, property, or safety of elizaOS, our
                    users, or others
                  </li>
                  <li>
                    In connection with a merger, sale, or acquisition of all or
                    part of our company
                  </li>
                  <li>With your consent or at your direction</li>
                </ul>
                <p className="text-white/80 leading-relaxed mt-4">
                  We do not sell your personal information to third parties.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  6. Data Security
                </h2>
                <p className="text-white/80 leading-relaxed">
                  We implement appropriate technical and organizational measures
                  to protect your personal information against unauthorized
                  access, alteration, disclosure, or destruction. However, no
                  method of transmission over the Internet or electronic storage
                  is 100% secure, and we cannot guarantee absolute security.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  7. Data Retention
                </h2>
                <p className="text-white/80 leading-relaxed">
                  We retain your personal information for as long as necessary
                  to fulfill the purposes outlined in this Privacy Policy,
                  unless a longer retention period is required or permitted by
                  law. When we no longer need your information, we will securely
                  delete or anonymize it.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  8. Your Rights and Choices
                </h2>
                <p className="text-white/80 leading-relaxed">
                  Depending on your location, you may have certain rights
                  regarding your personal information, including:
                </p>
                <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
                  <li>Access to your personal information</li>
                  <li>Correction of inaccurate information</li>
                  <li>Deletion of your information</li>
                  <li>Objection to processing of your information</li>
                  <li>Data portability</li>
                  <li>Withdrawal of consent</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  9. Cookies and Tracking Technologies
                </h2>
                <p className="text-white/80 leading-relaxed">
                  We use cookies and similar tracking technologies to collect
                  and track information about your use of our Service. You can
                  control cookies through your browser settings, but disabling
                  cookies may affect your ability to use certain features of our
                  Service.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  10. Third-Party Services
                </h2>
                <p className="text-white/80 leading-relaxed">
                  Our Service may contain links to third-party websites or
                  services that are not owned or controlled by elizaOS. We are
                  not responsible for the privacy practices of these third
                  parties. We encourage you to review their privacy policies.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  11. Children&apos;s Privacy
                </h2>
                <p className="text-white/80 leading-relaxed">
                  Our Service is not intended for children under the age of 13.
                  We do not knowingly collect personal information from children
                  under 13. If you become aware that a child has provided us
                  with personal information, please contact us.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  12. International Data Transfers
                </h2>
                <p className="text-white/80 leading-relaxed">
                  Your information may be transferred to and maintained on
                  computers located outside of your state, province, country, or
                  other governmental jurisdiction where privacy laws may differ.
                  By using our Service, you consent to this transfer.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  13. Changes to This Privacy Policy
                </h2>
                <p className="text-white/80 leading-relaxed">
                  We may update this Privacy Policy from time to time. We will
                  notify you of any changes by posting the new Privacy Policy on
                  this page and updating the &quot;Last updated&quot; date. Your
                  continued use of the Service after any changes constitutes
                  acceptance of the updated Privacy Policy.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  14. Contact Us
                </h2>
                <p className="text-white/80 leading-relaxed">
                  If you have any questions about this Privacy Policy or our
                  privacy practices, please contact us through our support
                  channels.
                </p>
              </section>
            </div>

            {/* Footer */}
            <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row gap-4 justify-between items-center">
              <Link
                href="/terms-of-service"
                className="text-sm text-white/60 hover:text-[#FF5800] transition-colors underline underline-offset-4"
              >
                Terms of Service
              </Link>
              <Link
                href="/login"
                className="text-sm text-white/60 hover:text-[#FF5800] transition-colors"
              >
                Return to login
              </Link>
            </div>
          </div>
        </BrandCard>
      </div>
    </div>
  );
}
