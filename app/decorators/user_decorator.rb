include ActionView::Helpers::DateHelper

class UserDecorator
  MAX_RECENT_EVENTS = 5

  def initialize(user)
    @user = user
  end

  delegate :email, to: :user
  delegate :totp_enabled?, to: :user

  def lockout_time_remaining_in_words
    current_time = Time.zone.now

    distance_of_time_in_words(
      current_time, current_time + lockout_time_remaining, true, highest_measures: 2
    )
  end

  def lockout_time_remaining
    (Devise.direct_otp_valid_for - (Time.zone.now - user.second_factor_locked_at)).to_i
  end

  def confirmation_period_expired_error
    I18n.t('errors.messages.confirmation_period_expired', period: confirmation_period)
  end

  def confirmation_period
    current_time = Time.zone.now

    distance_of_time_in_words(
      current_time, current_time + Devise.confirm_within, true, accumulate_on: :hours
    )
  end

  def masked_two_factor_phone_number
    masked_number(user.phone)
  end

  def identity_verified?
    user.active_profile.present?
  end

  def identity_not_verified?
    !identity_verified?
  end

  def active_identity_for(service_provider)
    user.active_identities.find_by(service_provider: service_provider.issuer)
  end

  def pending_profile
    user.profiles.verification_pending.order(created_at: :desc).first
  end

  def active_or_pending_profile
    user.active_profile || pending_profile
  end

  # This user's most recently activated profile that has also been deactivated
  # due to a password reset, or nil if there is no such profile
  def password_reset_profile
    profile = user.profiles.order(activated_at: :desc).first
    profile if profile&.password_reset?
  end

  def qrcode(otp_secret_key)
    options = {
      issuer: 'Login.gov',
      otp_secret_key: otp_secret_key,
    }
    url = user.provisioning_uri(nil, options)
    qrcode = RQRCode::QRCode.new(url)
    qrcode.as_png(size: 280).to_data_url
  end

  def blocked_from_entering_2fa_code?
    user.second_factor_locked_at.present? && !blocked_from_2fa_period_expired?
  end

  def no_longer_blocked_from_entering_2fa_code?
    user.second_factor_locked_at.present? && blocked_from_2fa_period_expired?
  end

  def should_acknowledge_personal_key?(session)
    return true if session[:new_personal_key]

    sp_session = session[:sp]

    user.personal_key.blank? && (sp_session.blank? || sp_session[:loa3] == false)
  end

  def recent_events
    events = user.events.order('updated_at DESC').limit(MAX_RECENT_EVENTS).map(&:decorate)
    identities = user.identities.order('last_authenticated_at DESC').map(&:decorate)
    (events + identities).sort { |thing_a, thing_b| thing_b.happened_at <=> thing_a.happened_at }
  end

  def verified_account_partial
    if identity_verified?
      'accounts/verified_account_badge'
    else
      'shared/null'
    end
  end

  private

  attr_reader :user

  def masked_number(number)
    "***-***-#{number[-4..-1]}"
  end

  def blocked_from_2fa_period_expired?
    (Time.zone.now - user.second_factor_locked_at) > Devise.direct_otp_valid_for
  end
end
