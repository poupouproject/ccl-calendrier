import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:4321/jeunesse/montagne/sortie';

// Helper : retourne les groupes visibles (non-hidden) dans la page.
// Sélectionne uniquement les cartes d'événements (article avec data-status + data-groupe),
// pas les boutons de filtre qui ont aussi data-groupe.
async function visibleGroupes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-status][data-groupe]'));
    return cards
      .filter((c) => !c.hidden)
      .map((c) => c.dataset.groupe ?? '');
  });
}

test.describe('Filtres de groupe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Attendre une carte visible (pas hidden) — le filtre "À venir" est actif par défaut
    await page.waitForSelector('[data-status]:not([hidden])', { timeout: 10000 });
    // Passer en filtre "Tout" pour voir toutes les cartes
    await page.getByRole('button', { name: 'Tout' }).click();
  });

  test('Les 3 boutons de groupe sont présents', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Tous' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lundi & 2 jours' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mercredi & 2 jours' })).toBeVisible();
  });

  test('Filtre "Tous" — toutes les cartes visibles (aucun groupe filtré)', async ({ page }) => {
    await page.getByRole('button', { name: 'Tous' }).click();
    const groupes = await visibleGroupes(page);
    // Avec "Tous", on peut avoir n'importe quel groupe présent
    // On vérifie juste qu'il y a des cartes visibles
    expect(groupes.length).toBeGreaterThan(0);
    // Et que le bouton "Tous" est actif
    await expect(page.getByRole('button', { name: 'Tous' })).toHaveClass(/active/);
  });

  test('Filtre "Lundi & 2 jours" — seuls lundi et deuxjours sont visibles', async ({ page }) => {
    await page.getByRole('button', { name: 'Lundi & 2 jours' }).click();

    const groupes = await visibleGroupes(page);

    // Il ne doit pas y avoir de carte "mercredi" ni "tierce" visible
    const interdits = groupes.filter((g) => g === 'mercredi' || g === 'tierce');
    expect(interdits, `Groupes interdits visibles avec filtre Lundi: ${interdits}`).toHaveLength(0);

    // Le bouton doit être actif
    await expect(page.getByRole('button', { name: 'Lundi & 2 jours' })).toHaveClass(/active/);
  });

  test('Filtre "Mercredi & 2 jours" — seuls mercredi et deuxjours sont visibles', async ({ page }) => {
    await page.getByRole('button', { name: 'Mercredi & 2 jours' }).click();

    const groupes = await visibleGroupes(page);

    // Il ne doit pas y avoir de carte "lundi" ni "tierce" visible
    const interdits = groupes.filter((g) => g === 'lundi' || g === 'tierce');
    expect(interdits, `Groupes interdits visibles avec filtre Mercredi: ${interdits}`).toHaveLength(0);

    // Le bouton doit être actif
    await expect(page.getByRole('button', { name: 'Mercredi & 2 jours' })).toHaveClass(/active/);
  });

  test('Les événements "tierce" ne passent pas à travers le filtre Lundi', async ({ page }) => {
    // S'assurer qu'il y a des cartes tierce dans le DOM (sinon le test est trivial)
    const allGroupes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLElement>('[data-groupe="tierce"]')).length;
    });
    console.log(`Nombre de cartes tierce dans le DOM: ${allGroupes}`);

    await page.getByRole('button', { name: 'Lundi & 2 jours' }).click();

    const terceVisibles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLElement>('[data-status][data-groupe="tierce"]'))
        .filter((c) => !c.hidden).length;
    });
    expect(terceVisibles, 'Des événements tierce ne devraient pas être visibles avec filtre Lundi').toBe(0);
  });

  test('Les événements "tierce" ne passent pas à travers le filtre Mercredi', async ({ page }) => {
    await page.getByRole('button', { name: 'Mercredi & 2 jours' }).click();

    const terceVisibles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLElement>('[data-status][data-groupe="tierce"]'))
        .filter((c) => !c.hidden).length;
    });
    expect(terceVisibles, 'Des événements tierce ne devraient pas être visibles avec filtre Mercredi').toBe(0);
  });

  test('Cycle complet Tous → Lundi → Mercredi → Tous', async ({ page }) => {
    // Tous
    await page.getByRole('button', { name: 'Tous' }).click();
    const tousGroupes = await visibleGroupes(page);
    expect(tousGroupes.length).toBeGreaterThan(0);

    // Lundi
    await page.getByRole('button', { name: 'Lundi & 2 jours' }).click();
    const lundiGroupes = await visibleGroupes(page);
    expect(lundiGroupes.every((g) => g === 'lundi' || g === 'deuxjours')).toBe(true);

    // Mercredi
    await page.getByRole('button', { name: 'Mercredi & 2 jours' }).click();
    const mercrediGroupes = await visibleGroupes(page);
    expect(mercrediGroupes.every((g) => g === 'mercredi' || g === 'deuxjours')).toBe(true);

    // Retour à Tous
    await page.getByRole('button', { name: 'Tous' }).click();
    const tousRetour = await visibleGroupes(page);
    expect(tousRetour.length).toBe(tousGroupes.length);
  });
});

test.describe('Filtres de période', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-status]:not([hidden])', { timeout: 10000 });
  });

  test('Par défaut, le filtre "À venir" est actif', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'À venir' })).toHaveClass(/active/);
  });

  test('Filtre "Tout" affiche aussi les événements passés', async ({ page }) => {
    await page.getByRole('button', { name: 'Tout' }).click();

    const pastVisible = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLElement>('[data-status="past"]'))
        .filter((c) => !c.hidden).length;
    });
    const passedExists = await page.evaluate(() =>
      document.querySelectorAll('[data-status="past"]').length > 0
    );
    if (passedExists) {
      expect(pastVisible).toBeGreaterThan(0);
    }
    await expect(page.getByRole('button', { name: 'Tout' })).toHaveClass(/active/);
  });
});
