import { SelectField } from 'react-md';
import QueryString from 'query-string';
import * as React from 'react';
import request from 'superagent';

// Components
import PayWithCoinbase from 'components/pay/Coinbase';
import PayWithSquare from 'components/pay/Square';

export class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      /**
       * The shortened payment object from the API
       * @type {object}
       */
      payment: null,
      /**
       * The selected payment method to use
       * @type {string}
       */
      method: null,
      /** @type {string[]} */
      errors: [],
      /**
       * Parsed `location.search`
       * @type {object}
       */
      q: null
    };
  }

  componentWillMount() {
    const q = QueryString.parse(location.search);

    request.get(`/api/payments/${q.payment_id}`).end(async (err, res) => {
      if (err) return history.back();
      if (res.body.paid !== null)
        return location.replace(res.body.redirect_url);

      res.body.methods = res.body.methods.map(m => {
        switch (m) {
          case 'card':
          case 'square':
            return { label: 'Credit Card', value: 'square' };
          case 'crypto':
          case 'coinbase':
            return { label: 'Cryptocurrency', value: 'coinbase' };
          default:
            return null;
        }
      });

      this.setState({
        q,
        method: q.method || res.body.methods[0].value,
        payment: res.body
      });
    });
  }

  /** @param {string|string[]} */
  onError(error) {
    this.setState({ errors: Array.isArray(error) ? error : [error] });
  }

  onSuccess() {
    this.setState({ errors: [] });
    location.replace(this.state.payment.redirect_url);
  }

  render() {
    const { payment, method, errors } = this.state;

    if (!payment) return null;

    const form = (() => {
      switch (method) {
        case 'coinbase':
          return <PayWithCoinbase Pay={this} />;
        case 'square':
          return <PayWithSquare Pay={this} />;
        default:
          return null;
      }
    })();

    return (
      <div className="pay-entry">
        {payment.methods.length > 1 ? (
          <header className="method-selector">
            <label>Payment Method</label>
            <SelectField
              id="payment-method"
              value={method}
              onChange={v => this.setState({ method: v })}
              menuItems={payment.methods}
              className="md-cell"
            />
          </header>
        ) : null}

        {errors.length ? (
          <ul className="errors">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}

        {form}
      </div>
    );
  }
}