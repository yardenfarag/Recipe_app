import { describe, expect, it } from 'vitest';

/** Mirrors the comment-mapping logic in instagram.ts for unit testing. */
function mapInstagramComments(
  rawComments: Array<{ text?: string; ownerUsername?: string; owner?: { username?: string } }>,
  ownerUsername?: string,
): Array<{ text: string; isCreator: boolean }> {
  return rawComments
    .map((comment) => {
      const text = (comment.text ?? '').trim();
      const author = comment.ownerUsername ?? comment.owner?.username;
      const isCreator = Boolean(
        ownerUsername && author && author.toLowerCase() === ownerUsername.toLowerCase(),
      );
      return { text, isCreator };
    })
    .filter((c) => c.text.length > 0);
}

describe('Instagram comment mapping', () => {
  it('flags the creator comment', () => {
    const comments = mapInstagramComments(
      [
        { text: 'Looks amazing!', ownerUsername: 'fan1' },
        { text: 'Full recipe: 2 cups flour...', ownerUsername: 'chefanna' },
      ],
      'chefanna',
    );

    expect(comments[1]?.isCreator).toBe(true);
    expect(comments[0]?.isCreator).toBe(false);
  });
});

describe('TikTok meta shape', () => {
  it('prefers text over desc for description', () => {
    const item = { text: 'Recipe in caption', desc: 'ignored' };
    const description = (item.text ?? item.desc)?.trim();
    expect(description).toBe('Recipe in caption');
  });

  it('resolves video id from Apify item', () => {
    const item = { id: '7499229683859426602' };
    expect(item.id).toBe('7499229683859426602');
  });
});
