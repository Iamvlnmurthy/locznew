'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

interface GalleryMedia {
  id: string;
  thumbUrl: string | null;
  cardUrl: string | null;
  fullUrl: string | null;
}

export function ListingGallery({
  media,
  title,
  badge,
  brandName,
  labels,
}: {
  media: GalleryMedia[];
  title: string;
  badge: string;
  brandName: string;
  labels: Record<string, string>;
}) {
  const photos = media.filter((item) => item.fullUrl || item.cardUrl || item.thumbUrl);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const active = photos[activeIndex];

  function move(direction: -1 | 1) {
    setActiveIndex((current) => (current + direction + photos.length) % photos.length);
  }

  useEffect(() => {
    if (!isExpanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsExpanded(false);
      if (event.key === 'ArrowLeft' && photos.length > 1) {
        setActiveIndex((current) => (current - 1 + photos.length) % photos.length);
      }
      if (event.key === 'ArrowRight' && photos.length > 1) {
        setActiveIndex((current) => (current + 1) % photos.length);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('has-gallery-lightbox');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('has-gallery-lightbox');
    };
  }, [isExpanded, photos.length]);

  const imageUrl = active?.fullUrl ?? active?.cardUrl ?? active?.thumbUrl;

  return (
    <>
      <div className="listing-gallery">
        <div className="listing-gallery__stage">
          <span className="listing-gallery__badge">{badge}</span>
          {imageUrl ? (
            <button
              type="button"
              className="listing-gallery__image"
              onClick={() => setIsExpanded(true)}
              aria-label={labels.openFullscreen.replace('{title}', title)}
            >
              <img
                src={imageUrl}
                alt={
                  activeIndex === 0
                    ? title
                    : labels.photoAlt
                        .replace('{title}', title)
                        .replace('{number}', String(activeIndex + 1))
                }
                width={1600}
                height={1200}
                loading={activeIndex === 0 ? 'eager' : 'lazy'}
                fetchPriority={activeIndex === 0 ? 'high' : 'auto'}
              />
            </button>
          ) : (
            <div className="listing-gallery__placeholder">
              <Icon name="image" />
              <span>{brandName}</span>
            </div>
          )}

          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="listing-gallery__arrow listing-gallery__arrow--previous"
                onClick={() => move(-1)}
                aria-label={labels.previousPhoto}
              >
                <Icon name="chevronLeft" />
              </button>
              <button
                type="button"
                className="listing-gallery__arrow listing-gallery__arrow--next"
                onClick={() => move(1)}
                aria-label={labels.nextPhoto}
              >
                <Icon name="chevronRight" />
              </button>
            </>
          ) : null}

          {imageUrl ? (
            <button
              type="button"
              className="listing-gallery__expand"
              onClick={() => setIsExpanded(true)}
            >
              <Icon name="expand" />
              <span>{labels.viewLarger}</span>
            </button>
          ) : null}

          {photos.length ? (
            <span className="listing-gallery__count">
              {activeIndex + 1} / {photos.length}
            </span>
          ) : null}
        </div>

        {photos.length > 1 ? (
          <div className="listing-gallery__thumbs" aria-label={labels.listingPhotos}>
            {photos.map((item, index) => {
              const thumb = item.thumbUrl ?? item.cardUrl ?? item.fullUrl;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={index === activeIndex ? 'is-active' : ''}
                  onClick={() => setActiveIndex(index)}
                  aria-label={labels.viewPhoto.replace('{number}', String(index + 1))}
                  aria-current={index === activeIndex ? 'true' : undefined}
                >
                  <img src={thumb ?? ''} alt="" loading="lazy" width={76} height={64} />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {isExpanded && imageUrl ? (
        <div
          className="listing-gallery__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={labels.photoViewer}
        >
          <button
            type="button"
            className="listing-gallery__close"
            onClick={() => setIsExpanded(false)}
            aria-label={labels.closePhotoViewer}
          >
            ×
          </button>
          <img
            src={imageUrl}
            alt={labels.photoAlt
              .replace('{title}', title)
              .replace('{number}', String(activeIndex + 1))}
          />
          {photos.length > 1 ? (
            <>
              <button type="button" onClick={() => move(-1)} aria-label={labels.previousPhoto}>
                <Icon name="chevronLeft" />
              </button>
              <button type="button" onClick={() => move(1)} aria-label={labels.nextPhoto}>
                <Icon name="chevronRight" />
              </button>
            </>
          ) : null}
          <span>
            {labels.photoCount
              .replace('{current}', String(activeIndex + 1))
              .replace('{total}', String(photos.length))}
          </span>
        </div>
      ) : null}
    </>
  );
}
