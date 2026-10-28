<script setup lang="ts">
definePageMeta({ layout: 'legal', auth: false })
useSeoMeta({ title: 'Privacy Policy' })
</script>

<template>
  <article>
    <PageHeader
      kicker="Legal"
      title="Privacy Policy"
      description="What Insight collects about you, why, and the choices you have."
    />
    <p class="mono-meta mt-6">
      Last updated October 28, 2026
    </p>

    <div class="legal-prose mt-8">
      <p>
        This policy explains how Answer United, Inc. (“Answer United”, “we”, “us”) handles personal information in Insight, the portal where our clients and the people they authorize view messages, call recordings and account information.
      </p>
      <p>
        It covers Insight only. The Answer United website is covered by its own <a href="https://www.answerunited.com/privacy">privacy policy</a>. Messages, recordings and caller details we handle for a client are handled under our agreement with that client (see section 1).
      </p>

      <h2>1. Information we collect</h2>
      <h3>Account information</h3>
      <ul>
        <li>Your name and email address, the accounts you belong to and your role in each, and who invited you and when.</li>
        <li>If you set a password, we store only a one-way hash of it, never the password itself.</li>
        <li>If you add a passkey, we store its public key, the name you give it and when it was last used. The private key stays on your device, and any fingerprint or face data used to unlock it never leaves your device.</li>
      </ul>

      <h3>Sign-in activity</h3>
      <ul>
        <li>When you last signed in, which the owners and admins of your accounts can see.</li>
        <li>Sign-in links, codes and invitation links, stored only as hashes. Sign-in links and codes expire after 15 minutes.</li>
        <li>We briefly use your IP address and email address to limit repeated sign-in attempts. Our servers and hosting providers may also keep standard logs, such as IP address, browser type and the time and page requested, to run and secure Insight.</li>
      </ul>

      <h3>Client content</h3>
      <p>
        Insight displays messages, call recordings and caller details that Answer United handles for its clients. We process this information on the client’s behalf and under our agreement with the client, and the client decides who can see it. If you have a question about your information in a client’s messages or recordings, please contact that client.
      </p>

      <h2>2. Cookies and browser storage</h2>
      <p>
        Insight uses only what it needs to work:
      </p>
      <ul>
        <li>an essential, encrypted session cookie that keeps you signed in; and</li>
        <li>your light or dark mode preference, saved in your browser.</li>
      </ul>
      <p>
        Insight does not use advertising or tracking cookies or third-party analytics. If you block cookies, you will not be able to sign in.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>To provide Insight and show you the accounts you have access to.</li>
        <li>To sign you in, keep accounts secure and prevent abuse.</li>
        <li>To send the emails Insight needs to work, such as invitations, sign-in links and codes, and password resets.</li>
        <li>To provide support, and to meet our legal obligations.</li>
      </ul>
      <p>
        We do not sell or rent your personal information, and we do not use it for advertising.
      </p>

      <h2>4. How we share information</h2>
      <ul>
        <li><strong>With the accounts you belong to.</strong> Owners and admins of an account can see your name, email address, role and last sign-in.</li>
        <li><strong>With service providers</strong> that host Insight and deliver its email, such as Amazon Web Services. They may use the information only to provide those services to us and must keep it confidential.</li>
        <li><strong>When the law requires it,</strong> or when needed to protect the rights, property or safety of Answer United, our clients or others.</li>
        <li><strong>In a business transfer,</strong> such as a merger or sale of Answer United, subject to this policy.</li>
      </ul>

      <h2>5. How long we keep it</h2>
      <p>
        We keep your account information while you have access to Insight, and for a reasonable period afterward for security, record-keeping and legal purposes. You can ask us to delete it sooner (see section 7). Client content is kept for the period set by the client’s service plan.
      </p>

      <h2>6. Security</h2>
      <p>
        Insight is served only over encrypted connections. Passwords and sign-in tokens are stored as hashes, and sessions are sealed so they cannot be read or altered. Changing or resetting your password signs you out on your other devices, and you can sign out other devices yourself from your Account page. No system is perfectly secure, so please tell us right away if you suspect unauthorized access.
      </p>

      <h2>7. Your choices</h2>
      <ul>
        <li>Update your name, change your password, manage your passkeys and sign out other devices from your Account page.</li>
        <li>Ask us for a copy of your personal information, or to correct or delete it, by contacting us. Your access to a client’s account is controlled by that client, so we may need to involve them.</li>
        <li>Depending on where you live, you may have other privacy rights. Contact us and we will help.</li>
      </ul>

      <h2>8. Children</h2>
      <p>
        Insight is a business tool and is not directed to children. We do not knowingly collect personal information from children under 16.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. We will change the date at the top of this page when we do, and let you know in Insight or by email before significant changes take effect.
      </p>

      <h2>10. Contact us</h2>
      <p>
        If you have a question about this policy, or think we have not followed it, please contact us and we will make commercially reasonable efforts to resolve it.
      </p>
      <p>
        Answer United, Inc.<br>
        2015 W Crosstown Pkwy, Kalamazoo, MI 49008<br>
        Support: <a href="tel:+18008730444">(800) 873-0444</a>
      </p>
    </div>
  </article>
</template>
