<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { object, string, ValidationError, ref as YupRef } from 'yup';
import { useI18n } from 'vue-i18n';
import FormStep from '@/components/FormStep/FormStep.vue';
import AppNotification from '@/components/AppNotification/AppNotification.vue';
import { backendApi } from '@/main';
import { useChallengeV3 } from 'vue-recaptcha';
import { NotificationTypes } from '@/interfaces/error.interface';
import type { AxiosResponse } from 'axios';
import type { User } from '@/interfaces/user.interface';
import type { VerificationMessage } from '@/interfaces/verificationMessage.interface';
import { useUserStore } from '@/stores/user';
import { io } from 'socket.io-client';
import { useRouter } from 'vue-router';

const { execute } = useChallengeV3('register');
const { t } = useI18n({ useScope: 'global' });
const step = ref(1);

const router = useRouter();
const userStore = useUserStore();

watch(
  () => step.value,
  () => {
    isEnabledButton.value = canContinue();
  },
);

const errors = ref<{
  [key: string]: string;
}>({});
const isEnabledButton = ref(false);

const username = ref(''),
  email = ref(''),
  password = ref(''),
  confirm_password = ref('');

const canContinue = () => {
  switch (step.value) {
    case 1:
      if (
        Object.keys(errors.value).length === 0 &&
        username.value !== '' &&
        email.value !== ''
      ) {
        return true;
      } else {
        return false;
      }
    case 2:
      if (
        Object.keys(errors.value).length === 0 &&
        password.value !== '' &&
        confirm_password.value !== ''
      ) {
        return true;
      } else {
        return false;
      }
    case 3:
      if (Object.keys(errors.value).length === 0) {
        return true;
      } else {
        return false;
      }
    default:
      return false;
  }
};

const regsiterShape = object().shape({
  username: string()
    .required(t('register.validation.username.required'))
    .min(3, t('register.validation.username.min'))
    .max(16, t('register.validation.username.max'))
    .test({
      name: 'is-valid',
      test: (value) => {
        return /^[a-zA-Z0-9_]+$/.test(value);
      },
      message: t('register.validation.username.invalid'),
    }),
  email: string()
    .required(t('register.validation.email.required'))
    .email(t('register.validation.email.invalid')),
  password: string()
    .required(t('register.validation.password.required'))
    .min(8, t('register.validation.password.min'))
    .max(32, t('register.validation.password.max')),
  confirm_password: string()
    .required(t('register.validation.password.confirmed'))
    .oneOf([YupRef('password')], t('register.validation.password.confirmed')),
});

const validate = (field: string) => {
  regsiterShape
    .validateAt(field, {
      username: username.value,
      email: email.value,
      password: password.value,
      confirm_password: confirm_password.value,
    })
    .catch((err: ValidationError) => {
      errors.value[field] = err.message;
    })
    .then((res) => {
      if (res) delete errors.value[field];
    })
    .finally(() => {
      isEnabledButton.value = canContinue();
    });
};

const register = () => {
  regsiterShape
    .validate(
      {
        username: username.value,
        email: email.value,
        password: password.value,
        confirm_password: confirm_password.value,
      },
      { abortEarly: false },
    )
    .then((res) => {
      if (res && canContinue()) {
        execute()
          .catch(() => {
            errors.value['register'] = t('register.validation.captcha');
          })
          .then((captchaResponse) => {
            backendApi
              .post('/users', {
                username: username.value,
                email: email.value,
                password: password.value,
                confirm_password: confirm_password.value,
                captcha_token: captchaResponse,
              })
              .catch((err) => {
                errors.value['register'] = t(err.response.data.message);
              })
              .then((response: AxiosResponse<User> | void) => {
                if (response) {
                  const { data } = response;
                  step.value = 3;

                  const socket = io(
                    import.meta.env.VITE_WEBSOCKET_ENDPOINT + '/verification',
                  );

                  socket.on('verify', (message: VerificationMessage) => {
                    if (message.status === 'success') {
                      if (message.user !== data.id) return;

                      execute().then((captchaResponse) => {
                        userStore
                          .login(
                            username.value,
                            password.value,
                            captchaResponse,
                          )
                          .then(() => {
                            router.push('/home');
                            socket.close();
                          });
                      });
                    } else if (message.status === 'failed') {
                      errors.value['register'] = 'Something went wrong.';

                      step.value = 2;
                      socket.close();
                    }
                  });

                  socket.on('connect', () => {
                    socket.emit('verify', {
                      user: data.id,
                    });
                  });
                }
              });
          });
      }
    })
    .catch((err: ValidationError) => {
      err.inner.forEach((error) => {
        if (error.path) errors.value[error.path] = error.message;
      });
    });
};

onMounted(() => {
  window.dispatchEvent(new Event('hideHeader'));
  window.dispatchEvent(new Event('hideFooter'));
});
onUnmounted(() => {
  window.dispatchEvent(new Event('showHeader'));
  window.dispatchEvent(new Event('showFooter'));
});
</script>

<template>
  <div class="reg-bg">
    <h1 class="reg__title">
      {{
        step != 3
          ? $t('register.registration')
          : $t('register.post_registration')
      }}
    </h1>
    <form class="reg__form" @submit.prevent>
      <FormStep v-if="step == 1">
        <FormInput
          v-model="username"
          :name="'username'"
          @keyup="validate('username')"
          @blur="validate('username')"
        />
        <FormInput
          v-model="email"
          :name="'email'"
          @keyup="validate('email')"
          @blur="validate('email')"
        />
      </FormStep>
      <FormStep v-if="step == 2">
        <FormInput
          v-model="password"
          :forPasswd="true"
          :name="'password'"
          @keyup="validate('password')"
          @blur="validate('password')"
        />
        <FormInput
          v-model="confirm_password"
          :forPasswd="true"
          :name="'confirm_password'"
          @keyup="validate('confirm_password')"
          @blur="validate('confirm_password')"
        />
      </FormStep>
      <FormStep v-if="step == 3">
        <div class="reg__note">
          <span>{{ $t('register.note') }}</span>
          <p>Please, activate your account by logging in from the game.</p>
          <span class="reg__note-help">
            Do not leave this page until you have activated your account!
            <p>
              Stuck? Need help? Read this article
              <RouterLink to="/faq" target="_blank">How to connect?</RouterLink>
            </p>
          </span>
        </div>
      </FormStep>
      <div class="reg__stepper">
        <button
          @click="
            () => {
              step--;
              errors = {};
            }
          "
          :disabled="step == 1"
          class="reg__btn btn-back initial"
          :class="{ 'initial-fadeIn': step == 2 }"
        >
          {{ $t('register.back') }}
        </button>
        <div class="stepper__bar">
          <StepIcon :step="step"></StepIcon>
          <div>
            <span class="step">{{ $t('register.step') }}</span>
            <span class="step"> {{ step }}/3 </span>
          </div>
        </div>
        <button
          @click="step !== 2 ? step++ : register()"
          :disabled="!isEnabledButton"
          class="reg__btn btn-continue"
          :class="{ initial: step == 3, disabled: !isEnabledButton }"
        >
          {{ $t('register.continue') }}
        </button>
      </div>
      <TransitionGroup name="list" tag="ul" class="reg__error-wrapper">
        <li class="li" v-for="error of errors" :key="error">
          <AppNotification
            :type="NotificationTypes.ERROR"
            :floating="false"
            :message="error"
          />
        </li>
      </TransitionGroup>
      <span
        v-html="$t('meta.recaptcha.agreement')"
        class="reg__captcha_agreement"
      >
      </span>
      <RouterLink class="reg__link" to="/">{{
        $t('register.already_have_account')
      }}</RouterLink>
    </form>
    <AppLogo class="reg__logo" />
  </div>
</template>

<style lang="scss" scoped>
.reg-bg {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100vh;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    z-index: -1;
    display: block;
    width: 100%;
    height: 100%;
    background: url('@/assets/img/reg-bg.jpg') no-repeat center top;
    opacity: 15%;
  }
}

.reg__title {
  margin: 100px 0 50px;
  font-style: normal;
  font-weight: 700;
  font-size: 64px;
  line-height: 87px;
  text-align: center;
  color: #ffffff;
}

.reg__form {
  width: 540px;
  text-align: center;
}

.reg__note {
  padding: 18px 32px;
  margin: 0 0 8px;
  text-align: left;
  color: #ffffff;
  background-color: #262626;

  span:first-child {
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    line-height: 19px;
    text-align: center;
    color: $secondary;
  }

  p {
    margin: 0;
    font-style: normal;
    font-weight: 600;
    font-size: 24px;
    line-height: 33px;
  }
}

.reg__note-help {
  display: flex;
  flex-direction: column;
  font-style: normal;
  font-weight: 400;
  font-size: 21px;
  line-height: 19px;
  text-align: center;
  color: #ffffff;
  margin-top: 10px;

  p {
    margin: 0;
    font-style: normal;
    font-weight: 400;
    font-size: 15px;
    line-height: 19px;
    text-align: center;
    color: $secondary;
    margin-top: 10px;

    a {
      font-style: normal;
      text-decoration: none;
      color: $main;
      transition: color 0.3s ease;

      &:hover {
        color: $main-hover;
      }
    }
  }
}

.reg__link {
  display: block;
  margin-top: 32px;
  font-style: normal;
  font-weight: 600;
  font-size: 18px;
  line-height: 25px;
  text-decoration: none;
  color: $main-hover;
  transition: color 0.3s linear;

  &:hover {
    color: $secondary;
  }
}

.reg__stepper {
  display: flex;
  text-align: left;
  width: 100%;
  height: 80px;

  .reg__btn {
    font-style: normal;
    font-weight: 700;
    font-size: 20px;
    line-height: 27px;
    border: none;
    outline: none;
    transition: background-color 0.3s linear;
  }
  .btn-back {
    position: relative;
    display: flex;
    padding: 26px 32px 26px 67px;
    margin-right: 8px;
    color: $main-hover;
    background-color: #262626;

    &::after {
      content: '';
      position: absolute;
      left: 24px;
      display: block;
      align-self: center;
      width: 32px;
      height: 32px;
      background: url('@/assets/svg/modal-arrow-blue.svg');
    }

    &:hover {
      background-color: #333333;
    }
  }

  .btn-continue {
    position: relative;
    display: flex;
    padding: 26px 32px 26px 67px;
    margin-left: 8px;
    color: #ffffff;
    background-color: #e00087;

    &::after {
      content: '';
      position: absolute;
      left: 24px;
      display: block;
      align-self: center;
      width: 32px;
      height: 32px;
      background: url('@/assets/svg/modal-arrow.svg');
    }

    &:hover {
      background-color: #d6007f;
    }
  }

  .disabled {
    background-color: #b5b5b5;

    &:hover {
      background-color: #b5b5b5;
    }
  }

  // animation
  .initial {
    width: 0;
    padding: 26px 0px;
    margin: 0;
    opacity: 0;
    overflow: hidden;
    transition: all 0.3s linear;
  }

  .initial-fadeIn {
    width: 230px;
    opacity: 1;
    margin-right: 8px;
    padding: 26px 32px 26px 67px;
  }

  .stepper__bar {
    display: flex;
    align-items: center;
    width: 100%;
    background-color: #344f7f;
    transition: all 0.3s linear;

    div {
      display: flex;
      flex-direction: column;

      .step:nth-child(1) {
        font-style: normal;
        font-weight: 400;
        font-size: 12px;
        line-height: 16px;
        color: #ffffff;
      }

      .step:nth-child(2) {
        position: relative;
        font-style: normal;
        font-weight: 700;
        font-size: 20px;
        line-height: 27px;
        color: #ffffff;
        transform: translateY(-2px);
      }
    }
  }
}

.reg__error-wrapper {
  list-style: none;
  padding: 0;
  margin: 0;

  & > .li {
    margin-top: 10px;
  }
}

.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  height: 0px;
  opacity: 0;
  margin: 0 !important;
  transform: translateX(30px);
}

.list-leave-from,
.list-enter-to {
  height: 70px;
  margin-top: 10px;
}

.list-leave-active {
  width: 540px;
}

.reg__logo {
  margin-top: 50px;
}
</style>
