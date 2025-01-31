require 'rails_helper'

RSpec.describe Idv::InPerson::SsnController do
  include IdvHelper

  let(:pii_from_user) { Idp::Constants::MOCK_IDV_APPLICANT_SAME_ADDRESS_AS_ID_WITH_NO_SSN.dup }

  let(:flow_session) do
    { 'document_capture_session_uuid' => 'fd14e181-6fb1-4cdc-92e0-ef66dad0df4e',
      :pii_from_user => pii_from_user,
      :threatmetrix_session_id => 'c90ae7a5-6629-4e77-b97c-f1987c2df7d0',
      :flow_path => 'standard' }
  end

  let(:ssn) { Idp::Constants::MOCK_IDV_APPLICANT_WITH_SSN[:ssn] }

  let(:user) { create(:user) }

  let(:ab_test_args) do
    { sample_bucket1: :sample_value1, sample_bucket2: :sample_value2 }
  end

  before do
    allow(subject).to receive(:pii_from_user).and_return(pii_from_user)
    allow(subject).to receive(:flow_session).and_return(flow_session)
    stub_sign_in(user)
    stub_analytics
    stub_attempts_tracker
    allow(@analytics).to receive(:track_event)
    allow(subject).to receive(:ab_test_analytics_buckets).and_return(ab_test_args)
  end

  describe 'before_actions' do
    context('#confirm_in_person_address_step_complete') do
      it 'redirects if the user hasn\'t completed the address page' do
        # delete address attributes on session
        flow_session[:pii_from_user].delete(:address1)
        flow_session[:pii_from_user].delete(:address2)
        flow_session[:pii_from_user].delete(:city)
        flow_session[:pii_from_user].delete(:state)
        flow_session[:pii_from_user].delete(:zipcode)
        get :show

        expect(response).to redirect_to idv_in_person_step_url(step: :address)
      end
    end
  end

  describe '#show' do
    let(:analytics_name) { 'IdV: doc auth ssn visited' }
    let(:analytics_args) do
      {
        analytics_id: 'In Person Proofing',
        flow_path: 'standard',
        irs_reproofing: false,
        step: 'ssn',
        same_address_as_id: true,
        pii_like_keypaths: [[:same_address_as_id], [:state_id, :state_id_jurisdiction]],
      }.merge(ab_test_args)
    end

    it 'renders the show template' do
      get :show

      expect(response).to render_template :show
    end

    it 'sends analytics_visited event' do
      get :show

      expect(@analytics).to have_received(:track_event).with(analytics_name, analytics_args)
    end

    it 'updates DocAuthLog ssn_view_count' do
      doc_auth_log = DocAuthLog.create(user_id: user.id)

      expect { get :show }.to(
        change { doc_auth_log.reload.ssn_view_count }.from(0).to(1),
      )
    end

    it 'adds a session id to flow session' do
      get :show
      expect(flow_session[:threatmetrix_session_id]).to_not eq(nil)
    end

    it 'adds a threatmetrix session id to idv_session' do
      get :show
      expect(subject.idv_session.threatmetrix_session_id).to_not eq(nil)
    end

    context 'with an ssn in session' do
      let(:referer) { idv_in_person_step_url(step: :address) }
      before do
        flow_session[:pii_from_user][:ssn] = ssn
        request.env['HTTP_REFERER'] = referer
      end

      context 'referer is not verify_info' do
        it 'redirects to verify_info' do
          get :show

          expect(response).to redirect_to(idv_in_person_verify_info_url)
        end
      end

      context 'referer is verify_info' do
        let(:referer) { idv_in_person_verify_info_url }
        it 'does not redirect' do
          get :show

          expect(response).to render_template :show
        end
      end
    end
  end

  describe '#update' do
    context 'valid ssn' do
      let(:params) { { doc_auth: { ssn: ssn } } }
      let(:analytics_name) { 'IdV: doc auth ssn submitted' }
      let(:analytics_args) do
        {
          analytics_id: 'In Person Proofing',
          flow_path: 'standard',
          irs_reproofing: false,
          step: 'ssn',
          success: true,
          errors: {},
          same_address_as_id: true,
          pii_like_keypaths: [[:same_address_as_id], [:errors, :ssn], [:error_details, :ssn]],
        }.merge(ab_test_args)
      end

      let(:idv_session) do
        {
          applicant: Idp::Constants::MOCK_IDV_APPLICANT,
          resolution_successful: true,
          profile_confirmation: true,
          vendor_phone_confirmation: true,
          user_phone_confirmation: true,
        }
      end

      it 'sends analytics_submitted event' do
        put :update, params: params

        expect(@analytics).to have_received(:track_event).with(analytics_name, analytics_args)
      end

      it 'logs attempts api event' do
        expect(@irs_attempts_api_tracker).to receive(:idv_ssn_submitted).with(
          ssn: ssn,
        )

        put :update, params: params
      end

      it 'merges ssn into pii session value' do
        put :update, params: params

        expect(flow_session[:pii_from_user][:ssn]).to eq(ssn)
      end

      it 'invalidates steps after ssn' do
        put :update, params: params

        expect(subject.idv_session.applicant).to be_blank
        expect(subject.idv_session.resolution_successful).to be_blank
        expect(subject.idv_session.profile_confirmation).to be_blank
        expect(subject.idv_session.vendor_phone_confirmation).to be_blank
        expect(subject.idv_session.user_phone_confirmation).to be_blank
      end

      it 'redirects to the expected page' do
        put :update, params: params

        expect(response).to redirect_to idv_in_person_verify_info_url
      end

      it 'does not change threatmetrix_session_id when updating ssn' do
        flow_session[:pii_from_user][:ssn] = ssn
        put :update, params: params
        session_id = flow_session[:threatmetrix_session_id]
        subject.threatmetrix_view_variables
        expect(flow_session[:threatmetrix_session_id]).to eq(session_id)
      end

      it 'does not change idv_session threatmetrix_session_id when updating ssn' do
        flow_session[:pii_from_user][:ssn] = ssn
        put :update, params: params
        session_id = subject.idv_session.threatmetrix_session_id
        subject.threatmetrix_view_variables
        expect(subject.idv_session.threatmetrix_session_id).to eq(session_id)
      end
    end

    context 'invalid ssn' do
      let(:params) { { doc_auth: { ssn: 'i am not an ssn' } } }
      let(:analytics_name) { 'IdV: doc auth ssn submitted' }
      let(:analytics_args) do
        {
          analytics_id: 'In Person Proofing',
          flow_path: 'standard',
          irs_reproofing: false,
          step: 'ssn',
          success: false,
          errors: {
            ssn: ['Enter a nine-digit Social Security number'],
          },
          error_details: { ssn: [:invalid] },
          same_address_as_id: true,
          pii_like_keypaths: [[:same_address_as_id], [:errors, :ssn], [:error_details, :ssn]],
        }.merge(ab_test_args)
      end

      render_views

      it 'renders the show template with an error message' do
        put :update, params: params

        expect(response).to have_rendered(:show)
        expect(@analytics).to have_received(:track_event).with(analytics_name, analytics_args)
        expect(response.body).to include('Enter a nine-digit Social Security number')
      end
    end
  end
end
