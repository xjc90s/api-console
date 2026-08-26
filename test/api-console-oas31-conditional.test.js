import { assert, aTimeout, fixture, html, waitUntil } from '@open-wc/testing';
import { AmfHelperMixin } from '@api-components/amf-helper-mixin/amf-helper-mixin.js';
import { AmfLoader, ApiDescribe } from './amf-loader.js';
import '../api-console.js';
import { documentationType } from './testHelper.js';

/** @typedef {import('..').ApiConsole} ApiConsole */

// A bare AmfHelperMixin instance used to resolve a declared type's `@id`.
// AmfLoader.lookupType resolves declares against the encoded WebApi, but in the
// amf 5.11.x flattened `@graph` form `document#declares` lives on the Document
// node (the encodes has none), so we resolve it against the expanded Document.
class ConditionalHelper extends AmfHelperMixin(Object) {}
const helper = new ConditionalHelper();

/**
 * Resolves the `@id` of a declared type by its `shacl#name`.
 * @param {Object} amf Raw (flattened) API model.
 * @param {string} name Declared type name.
 * @returns {string|undefined} The type `@id`, or undefined when not found.
 */
const declaredTypeId = (amf, name) => {
  helper.amf = amf; // expands the flattened `@graph`
  const expanded = Array.isArray(helper.amf) ? helper.amf[0] : helper.amf;
  const declares = helper._computeDeclares(expanded) || [];
  const match = declares
    .map((d) => (Array.isArray(d) ? d[0] : d))
    .find((d) => helper._getValue(d, helper.ns.w3.shacl.name) === name);
  return match && match['@id'];
};

/**
 * Integration coverage for OAS 3.1 / JSON Schema 2020-12 `if`/`then`/`else`
 * conditional-schema rendering (W-23748899), shipped in
 * `@api-components/api-type-document` 4.2.46.
 *
 * The `PetKindFields` schema in the `oas31-webhooks` fixture is the conditional
 * case: `if kind const=dog -> then breed; else indoor`. Before 4.2.46 the console
 * had no notion of a conditional shape, so this AnyShape (no `and`) fell through to
 * the scalar path and collapsed to a single generic "Any" badge. These tests drive
 * the real console -> api-documentation -> api-type-documentation -> api-type-document
 * shadow chain and assert the If/Then/Else branches render with their labels and
 * branch-specific properties, and that the shape is NOT rendered as a lone "Any".
 */
describe('API Console OAS 3.1 if/then/else conditional schema (W-23748899)', () => {
  const fileName = 'oas31-webhooks';

  /**
   * Selects a shape on the console (mirrors the `selectedFixture` pattern in
   * api-console.amf.test.js). The console forwards `.selected`/`.selectedType`
   * to `api-documentation`, which routes a `type` selection to api-type-documentation.
   * @returns {Promise<ApiConsole>}
   */
  // eslint-disable-next-line require-await
  const selectedFixture = async (amf, selected, type) => {
    const element = /** @type ApiConsole */ (await fixture(html`
      <api-console
        .amf="${amf}"
        .selectedShape="${selected}"
        .selectedShapeType="${type}"
      ></api-console>
    `));
    await aTimeout(0);
    return element;
  };

  /**
   * Resolves the top-level `<api-type-document>` for the currently selected type:
   * api-console -> api-documentation -> api-type-documentation -> api-type-document.
   * @param {ApiConsole} element
   * @returns {Promise<Element>}
   */
  const topTypeDocument = async (element) => {
    await waitUntil(() => Boolean(documentationType(element)), 'api-type-documentation did not render');
    const typeDocumentation = documentationType(element);
    await waitUntil(
      () => Boolean(typeDocumentation.shadowRoot.querySelector('api-type-document')),
      'api-type-document did not render'
    );
    return typeDocumentation.shadowRoot.querySelector('api-type-document');
  };

  const propertyNames = (typeDocumentElement) =>
    Array.from(typeDocumentElement.shadowRoot.querySelectorAll('property-shape-document'))
      .map((shape) => {
        const name = shape.shadowRoot.querySelector('.property-title .property-name');
        return name ? name.textContent.trim() : '';
      });

  // Regular + Compact only. The oas31-webhooks model is not published in flattened form.
  [
    new ApiDescribe('Regular model'),
    new ApiDescribe('Compact model', true),
  ].forEach(({ label, compact }) => {
    describe(label, () => {
      let amf;
      let typeId;

      before(async () => {
        amf = await AmfLoader.load({ compact, fileName });
        typeId = declaredTypeId(amf, 'PetKindFields');
        assert.ok(typeId, 'PetKindFields conditional type is present in the model');
      });

      // @covers AC-01
      it('routes the conditional PetKindFields type to api-type-document as a conditional shape', async () => {
        const element = await selectedFixture(amf, typeId, 'type');
        const typeDocument = await topTypeDocument(element);
        // @ts-ignore - custom element view-state props
        assert.isTrue(typeDocument.isConditional, 'api-type-document flags the shape as conditional');
        // @ts-ignore
        assert.isFalse(typeDocument.isScalar, 'a conditional shape is not collapsed to a scalar');
      });

      // @covers AC-01
      it('renders If / Then / Else branch sections with their labels', async () => {
        const element = await selectedFixture(amf, typeId, 'type');
        const typeDocument = await topTypeDocument(element);
        const root = typeDocument.shadowRoot;

        await waitUntil(() => Boolean(root.querySelector('.conditional-if-document')), 'if branch did not render');
        assert.exists(root.querySelector('.conditional-if-document'), 'renders the If branch document');
        assert.exists(root.querySelector('.conditional-then-document'), 'renders the Then branch document');
        assert.exists(root.querySelector('.conditional-else-document'), 'renders the Else branch document');

        const labels = Array.from(root.querySelectorAll('.inheritance-label')).map((n) => n.textContent.trim());
        assert.includeMembers(labels, ['If:', 'Then:', 'Else:'], 'renders If/Then/Else section labels');
      });

      // @covers AC-01
      it('renders the branch-specific properties (then -> breed, else -> indoor)', async () => {
        const element = await selectedFixture(amf, typeId, 'type');
        const typeDocument = await topTypeDocument(element);
        const root = typeDocument.shadowRoot;

        await waitUntil(() => Boolean(root.querySelector('.conditional-then-document')), 'then branch did not render');
        const thenDoc = root.querySelector('.conditional-then-document');
        await waitUntil(
          () => Boolean(thenDoc.shadowRoot.querySelector('property-shape-document')),
          'then branch properties did not render'
        );
        assert.include(propertyNames(thenDoc), 'breed', 'then branch documents the "breed" property');

        const elseDoc = root.querySelector('.conditional-else-document');
        await waitUntil(
          () => Boolean(elseDoc.shadowRoot.querySelector('property-shape-document')),
          'else branch properties did not render'
        );
        assert.include(propertyNames(elseDoc), 'indoor', 'else branch documents the "indoor" property');
      });

      // @covers AC-01
      it('does NOT collapse the conditional shape to a lone generic "Any" badge', async () => {
        const element = await selectedFixture(amf, typeId, 'type');
        const typeDocument = await topTypeDocument(element);
        const root = typeDocument.shadowRoot;

        await waitUntil(() => Boolean(root.querySelector('.conditional-if-document')), 'conditional template did not render');
        // The pre-4.2.46 behaviour rendered the AnyShape as a scalar: a single
        // top-level property-shape-document whose ".data-type" reads "Any". The
        // conditional template renders NO top-level property-shape-document (the
        // branch properties live inside the nested api-type-document shadow roots).
        assert.notExists(
          root.querySelector('property-shape-document'),
          'no top-level scalar/Any property shape is rendered for a conditional type'
        );
        const topDataTypes = Array.from(root.querySelectorAll('.data-type')).map((n) => n.textContent.trim());
        assert.notInclude(topDataTypes, 'Any', 'top-level shape is not labeled as generic "Any"');
      });
    });
  });
});
