import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18n } from '@18f/identity-i18n';
import { setupServer } from 'msw/node';
import type { SetupServer } from 'msw/node';
import { rest } from 'msw';
import { SWRConfig } from 'swr';
import { I18nContext } from '@18f/identity-react-i18n';
import { ComponentType } from 'react';
import { InPersonContext } from '../context';
import InPersonLocationFullAddressEntryPostOfficeSearchStep from './in-person-location-full-address-entry-post-office-search-step';
import { LOCATIONS_URL } from './in-person-location-post-office-search-step';

const USPS_RESPONSE = [
  {
    address: '100 Main St E, Bronwood, Georgia, 39826',
    location: {
      latitude: 31.831686000000005,
      longitude: -84.363768,
    },
    street_address: '100 Main St E',
    city: 'Bronwood',
    state: 'GA',
    zip_code: '39826',
  },
  {
    address: '200 Main St E, Bronwood, Georgia, 39826',
    location: {
      latitude: 32.831686000000005,
      longitude: -83.363768,
    },
    street_address: '200 Main St E',
    city: 'Bronwood',
    state: 'GA',
    zip_code: '39826',
  },
];

const DEFAULT_PROPS = {
  toPreviousStep() {},
  onChange() {},
  value: {},
  registerField() {},
};

describe('InPersonLocationFullAddressEntryPostOfficeSearchStep', () => {
  const wrapper: ComponentType = ({ children }) => (
    <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
  );

  let server: SetupServer;

  before(() => {
    server = setupServer();
    server.listen();
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    server.resetHandlers();
    // todo: should we return USPS_RESPONSE here?
    server.use(
      rest.post(LOCATIONS_URL, (_req, res, ctx) => res(ctx.json([{ name: 'Baltimore' }]))),
    );
  });

  it('renders the step', () => {
    const { getByRole } = render(
      <InPersonContext.Provider
        value={{
          inPersonOutageMessageEnabled: false,
          inPersonOutageExpectedUpdateDate: 'January 1, 2024',
          inPersonFullAddressEntryEnabled: true,
          usStatesTerritories: [['Delaware', 'DE']],
        }}
      >
        <InPersonLocationFullAddressEntryPostOfficeSearchStep {...DEFAULT_PROPS} />,
      </InPersonContext.Provider>,
      { wrapper },
    );

    expect(getByRole('heading', { name: 'in_person_proofing.headings.po_search.location' }));
  });

  context('USPS request returns an error', () => {
    beforeEach(() => {
      server.use(rest.post(LOCATIONS_URL, (_req, res, ctx) => res(ctx.status(500))));
    });

    it('displays a try again error message', async () => {
      const { findByText, findByLabelText } = render(
        <InPersonContext.Provider
          value={{
            inPersonOutageMessageEnabled: false,
            inPersonOutageExpectedUpdateDate: 'January 1, 2024',
            inPersonFullAddressEntryEnabled: true,
            usStatesTerritories: [['Delaware', 'DE']],
          }}
        >
          <InPersonLocationFullAddressEntryPostOfficeSearchStep {...DEFAULT_PROPS} />,
        </InPersonContext.Provider>,
        { wrapper },
      );

      await userEvent.type(
        await findByLabelText('in_person_proofing.body.location.po_search.address_label'),
        '222 Merchandise Mart Plaza',
      );
      await userEvent.type(
        await findByLabelText('in_person_proofing.body.location.po_search.city_label'),
        'Endeavor',
      );
      await userEvent.selectOptions(
        await findByLabelText('in_person_proofing.body.location.po_search.state_label'),
        'DE',
      );
      await userEvent.type(
        await findByLabelText('in_person_proofing.body.location.po_search.zipcode_label'),
        '19701',
      );

      await userEvent.click(
        await findByText('in_person_proofing.body.location.po_search.search_button'),
      );

      const error = await findByText('idv.failure.exceptions.post_office_search_error');
      expect(error).to.exist();
    });
  });

  it('displays validation error messages to the user if fields are empty', async () => {
    const { findAllByText, findByText } = render(
      <InPersonContext.Provider
        value={{
          inPersonOutageMessageEnabled: false,
          inPersonOutageExpectedUpdateDate: 'January 1, 2024',
          inPersonFullAddressEntryEnabled: true,
          usStatesTerritories: [['Delaware', 'DE']],
        }}
      >
        <InPersonLocationFullAddressEntryPostOfficeSearchStep {...DEFAULT_PROPS} />,
      </InPersonContext.Provider>,
      { wrapper },
    );

    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );

    const errors = await findAllByText('simple_form.required.text');
    expect(errors).to.have.lengthOf(4);
  });

  it('displays no post office results if a successful search is followed by an unsuccessful search', async () => {
    const { findByText, findByLabelText, queryByRole } = render(
      <InPersonContext.Provider
        value={{
          inPersonOutageMessageEnabled: false,
          inPersonOutageExpectedUpdateDate: 'January 1, 2024',
          inPersonFullAddressEntryEnabled: true,
          usStatesTerritories: [['Delaware', 'DE']],
        }}
      >
        <InPersonLocationFullAddressEntryPostOfficeSearchStep {...DEFAULT_PROPS} />,
      </InPersonContext.Provider>,
      { wrapper },
    );

    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.address_label'),
      '222 Merchandise Mart Plaza',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.city_label'),
      'Endeavor',
    );
    await userEvent.selectOptions(
      await findByLabelText('in_person_proofing.body.location.po_search.state_label'),
      'DE',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.zipcode_label'),
      '19701',
    );
    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );

    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.zipcode_label'),
      '00000',
    );
    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );

    const results = queryByRole('status', {
      name: 'in_person_proofing.body.location.location_button',
    });
    expect(results).not.to.exist();
  });

  it('clicking search again after first results do not clear results', async () => {
    const { findAllByText, findByText, findByLabelText } = render(
      <InPersonContext.Provider
        value={{
          inPersonOutageMessageEnabled: false,
          inPersonOutageExpectedUpdateDate: 'January 1, 2024',
          inPersonFullAddressEntryEnabled: true,
          usStatesTerritories: [['Delaware', 'DE']],
        }}
      >
        <InPersonLocationFullAddressEntryPostOfficeSearchStep {...DEFAULT_PROPS} />,
      </InPersonContext.Provider>,
      { wrapper },
    );

    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.address_label'),
      '222 Merchandise Mart Plaza',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.city_label'),
      'Endeavor',
    );
    await userEvent.selectOptions(
      await findByLabelText('in_person_proofing.body.location.po_search.state_label'),
      'DE',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.zipcode_label'),
      '19701',
    );
    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );
    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );
    await findAllByText('in_person_proofing.body.location.location_button');
  });

  it('displays correct pluralization for a single location result', async () => {
    const { findByLabelText, findByText } = render(
      <I18nContext.Provider
        value={
          new I18n({
            strings: {
              'in_person_proofing.body.location.po_search.results_description': {
                one: 'There is one participating Post Office within 50 miles of %{address}.',
                other:
                  'There are %{count} participating Post Offices within 50 miles of %{address}.',
              },
            },
          })
        }
      >
        <InPersonContext.Provider
          value={{
            inPersonOutageMessageEnabled: false,
            inPersonOutageExpectedUpdateDate: 'January 1, 2024',
            inPersonFullAddressEntryEnabled: true,
            usStatesTerritories: [['Delaware', 'DE']],
          }}
        >
          <InPersonLocationFullAddressEntryPostOfficeSearchStep {...DEFAULT_PROPS} />,
        </InPersonContext.Provider>
        ,
      </I18nContext.Provider>,
      { wrapper },
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.address_label'),
      '222 Merchandise Mart Plaza',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.city_label'),
      'Endeavor',
    );
    await userEvent.selectOptions(
      await findByLabelText('in_person_proofing.body.location.po_search.state_label'),
      'DE',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.zipcode_label'),
      '19701',
    );
    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );
    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );

    const addressQuery = '222 Merchandise Mart Plaza, Endeavor, DE 19701';
    const searchResultAlert = await findByText(
      `There is one participating Post Office within 50 miles of ${addressQuery}.`,
    );
    expect(searchResultAlert).to.exist();
  });

  it('displays correct pluralization for multiple location results', async () => {
    server.resetHandlers();
    server.use(rest.post(LOCATIONS_URL, (_req, res, ctx) => res(ctx.json(USPS_RESPONSE))));
    const { findByLabelText, findByText } = render(
      <I18nContext.Provider
        value={
          new I18n({
            strings: {
              'in_person_proofing.body.location.po_search.results_description': {
                one: 'There is one participating Post Office within 50 miles of %{address}.',
                other:
                  'There are %{count} participating Post Offices within 50 miles of %{address}.',
              },
            },
          })
        }
      >
        <InPersonContext.Provider
          value={{
            inPersonOutageMessageEnabled: false,
            inPersonOutageExpectedUpdateDate: 'January 1, 2024',
            inPersonFullAddressEntryEnabled: true,
            usStatesTerritories: [['Delaware', 'DE']],
          }}
        >
          <InPersonLocationFullAddressEntryPostOfficeSearchStep {...DEFAULT_PROPS} />,
        </InPersonContext.Provider>
        ,
      </I18nContext.Provider>,
      { wrapper },
    );

    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.address_label'),
      '222 Merchandise Mart Plaza',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.city_label'),
      'Endeavor',
    );
    await userEvent.selectOptions(
      await findByLabelText('in_person_proofing.body.location.po_search.state_label'),
      'DE',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.zipcode_label'),
      '19701',
    );
    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );
    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );

    const addressQuery = '222 Merchandise Mart Plaza, Endeavor, DE 19701';
    const searchResultAlert = await findByText(
      `There are ${USPS_RESPONSE.length} participating Post Offices within 50 miles of ${addressQuery}.`,
    );
    expect(searchResultAlert).to.exist();
  });

  it('allows user to select a location', async () => {
    const { findAllByText, findByLabelText, findByText, queryByText } = render(
      <InPersonContext.Provider
        value={{
          inPersonOutageMessageEnabled: false,
          inPersonOutageExpectedUpdateDate: 'January 1, 2024',
          inPersonFullAddressEntryEnabled: true,
          usStatesTerritories: [['Delaware', 'DE']],
        }}
      >
        <InPersonLocationFullAddressEntryPostOfficeSearchStep {...DEFAULT_PROPS} />,
      </InPersonContext.Provider>,
      { wrapper },
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.address_label'),
      '222 Merchandise Mart Plaza',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.city_label'),
      'Endeavor',
    );
    await userEvent.selectOptions(
      await findByLabelText('in_person_proofing.body.location.po_search.state_label'),
      'DE',
    );
    await userEvent.type(
      await findByLabelText('in_person_proofing.body.location.po_search.zipcode_label'),
      '19701',
    );

    await userEvent.click(
      await findByText('in_person_proofing.body.location.po_search.search_button'),
    );

    await userEvent.clear(
      await findByLabelText('in_person_proofing.body.location.po_search.address_label'),
    );
    await userEvent.clear(
      await findByLabelText('in_person_proofing.body.location.po_search.city_label'),
    );
    await userEvent.clear(
      await findByLabelText('in_person_proofing.body.location.po_search.zipcode_label'),
    );

    await userEvent.click(findAllByText('in_person_proofing.body.location.location_button')[0]);

    expect(await queryByText('simple_form.required.text')).to.be.null();
  });
});
