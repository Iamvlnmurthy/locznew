import Image from 'next/image';
import { Icon } from '@/components/icons';

interface AuthShellLabels {
  eyebrow: string;
  title: string;
  subtitle: string;
  messageTitle: string;
  messageText: string;
  saveTitle: string;
  saveText: string;
  postTitle: string;
  postText: string;
  brand: string;
  secureAccess: string;
  privacy: string;
}

export function AuthShell({
  children,
  labels,
  mode,
}: {
  children: React.ReactNode;
  labels: AuthShellLabels;
  mode: 'signin' | 'register';
}) {
  return (
    <main className={`auth-experience auth-experience--${mode}`}>
      <div className="container auth-experience__frame">
        <section className="auth-experience__story" aria-labelledby="auth-story-title">
          <div className="auth-experience__story-copy">
            <span className="eyebrow">
              <i /> {labels.eyebrow}
            </span>
            <h1 id="auth-story-title">{labels.title}</h1>
            <p>{labels.subtitle}</p>

            <div className="auth-experience__proof">
              <article>
                <span>
                  <Icon name="message" />
                </span>
                <div>
                  <strong>{labels.messageTitle}</strong>
                  <small>{labels.messageText}</small>
                </div>
              </article>
              <article>
                <span>
                  <Icon name="heart" />
                </span>
                <div>
                  <strong>{labels.saveTitle}</strong>
                  <small>{labels.saveText}</small>
                </div>
              </article>
              <article>
                <span>
                  <Icon name="plus" />
                </span>
                <div>
                  <strong>{labels.postTitle}</strong>
                  <small>{labels.postText}</small>
                </div>
              </article>
            </div>
          </div>

          <div className="auth-experience__visual" aria-hidden="true">
            <span className="auth-experience__orbit auth-experience__orbit--one" />
            <span className="auth-experience__orbit auth-experience__orbit--two" />
            <Image
              src="/illustrations/hero-neighbourhood-mobile.webp"
              alt=""
              width="620"
              height="620"
              priority
            />
          </div>
        </section>

        <section className="auth-experience__panel">
          <div className="auth-experience__brand">
            <Image src="/brand/locz-mark.png" alt="" width="34" height="34" />
            <span>
              <strong>{labels.brand}</strong>
              <small>{labels.secureAccess}</small>
            </span>
          </div>
          {children}
          <div className="auth-experience__trust">
            <span>
              <Icon name="shield" />
            </span>
            <p>{labels.privacy}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
