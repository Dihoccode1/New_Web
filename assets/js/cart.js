// assets/js/cart.js

$(document).ready(function () {
  // -----------------------------------------------------------
  // Dữ liệu Giỏ hàng Mẫu (Mô phỏng dữ liệu từ PHP/Server)
  // -----------------------------------------------------------

  const SHIPPING_FEE = 0; // Phí vận chuyển
  const $cartListContainer = $(".cart-product-list");
  const $summaryContainer = $(".cart-summary");
  const $emptyCartBlock = $(".empty-cart-block");
  const $fullCartBlock = $(".full-cart-block");

  // Hàm định dạng tiền tệ Việt Nam (VND)
  const formatCurrency = (amount) => {
    return amount.toLocaleString("vi-VN", {
      style: "currency",
      currency: "VND",
    });
  };

  /**
   * @brief Render (Vẽ) lại toàn bộ danh sách sản phẩm và Tóm tắt đơn hàng.
   */
  function renderCart() {
    if (cart.length === 0) {
      $fullCartBlock.hide();
      $emptyCartBlock.show();
      return;
    }

    $emptyCartBlock.hide();
    $fullCartBlock.show();

    $cartListContainer.empty();
    let subtotal = 0;
    let totalItems = 0;

    // 1. Render từng sản phẩm
    cart.forEach((item) => {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;
      totalItems += item.quantity;

      const html = `
                <div class="product-item row no-gutters align-items-center" data-id="${
                  item.id
                }">
                    <div class="col-md-2">
                        <img src="${item.image}" alt="${
        item.name
      }" class="img-fluid cart-img">
                    </div>
                    <div class="col-md-4">
                        <div class="cart-name">${item.name}</div>
                        <div class="cart-variant">${item.variant}</div>
                        <button class="btn-remove" data-id="${
                          item.id
                        }">Xóa</button>
                    </div>
                    <div class="col-md-2 text-center">
                        <span class="cart-price">${formatCurrency(
                          item.price
                        )}</span>
                    </div>
                    <div class="col-md-2 text-center">
                        <div class="quantity-control">
                            <button class="btn-qty btn-minus" data-id="${
                              item.id
                            }">-</button>
                            <input type="text" value="${
                              item.quantity
                            }" class="qty-input" data-id="${item.id}" readonly>
                            <button class="btn-qty btn-plus" data-id="${
                              item.id
                            }">+</button>
                        </div>
                    </div>
                    <div class="col-md-2 text-right">
                        <span class="cart-subtotal">${formatCurrency(
                          itemTotal
                        )}</span>
                    </div>
                </div>
            `;
      $cartListContainer.append(html);
    });

    // 2. Cập nhật Tóm tắt đơn hàng
    const grandTotal = subtotal + SHIPPING_FEE;
    const shippingText =
      SHIPPING_FEE === 0 ? "Miễn phí" : formatCurrency(SHIPPING_FEE);

    $summaryContainer.find(".total-price").text(formatCurrency(subtotal));
    $summaryContainer
      .find(".summary-line:first-child span:first-child")
      .text(`Tổng tiền (${totalItems} sản phẩm)`);
    $summaryContainer.find(".shipping-fee").text(shippingText);
    $summaryContainer.find(".grand-total").text(formatCurrency(grandTotal));

    // Cập nhật tổng tiền cho trang thanh toán (nếu có)
    $("#summary-total-products").text(
      `Tổng tiền hàng: ${formatCurrency(subtotal)}`
    );
    $("#summary-total-final").text(
      `Tổng thanh toán: ${formatCurrency(grandTotal)}`
    );
  }

  // -----------------------------------------------------------
  // Xử lý Tương tác Giỏ hàng (Thêm/Bớt)
  // -----------------------------------------------------------

  $fullCartBlock.on("click", ".btn-qty", function () {
    const itemId = $(this).data("id");
    const action = $(this).hasClass("btn-plus") ? 1 : -1;

    const item = cart.find((i) => i.id === itemId);
    if (item) {
      item.quantity += action;
      if (item.quantity < 1) {
        cart = cart.filter((i) => i.id !== itemId);
      }
      // *Lưu ý: Trong thực tế, cần gửi AJAX để cập nhật Session/Server tại đây.
      renderCart();
    }
  });

  $fullCartBlock.on("click", ".btn-remove", function () {
    const itemId = $(this).data("id");
    if (confirm("Bạn có chắc chắn muốn xóa sản phẩm này khỏi giỏ hàng?")) {
      cart = cart.filter((i) => i.id !== itemId);
      // *Lưu ý: Trong thực tế, cần gửi AJAX để cập nhật Session/Server tại đây.
      renderCart();
    }
  });

  // Gọi lần đầu để hiển thị giỏ hàng khi trang tải
  renderCart();

  // -----------------------------------------------------------
  // Logic Thanh toán (Dùng cho trang thanhtoan.php)
  // -----------------------------------------------------------

  // Ẩn/Hiện form nhập địa chỉ mới
  $("#delivery-address-selection").on(
    "change",
    'input[name="address-option"]',
    function () {
      const option = $(this).val();
      $("#new-address-form").slideToggle(option === "new");
    }
  );

  // Ẩn/Hiện thông báo thanh toán
  $("#payment-method-selection").on(
    "change",
    'input[name="payment-method"]',
    function () {
      const method = $(this).val();
      const $infoBlock = $("#payment-info-block");
      $infoBlock.empty().slideDown();

      if (method === "online") {
        $infoBlock.html(
          '<div class="alert alert-warning">Bạn đã chọn **Thanh toán trực tuyến**. Hệ thống sẽ chuyển đến cổng thanh toán sau khi xác nhận đơn hàng. (Chức năng chưa được xử lý tiếp)</div>'
        );
      } else if (method === "transfer") {
        $infoBlock.html(
          '<div class="alert alert-info">Vui lòng chuyển khoản với nội dung: MÃ_ĐƠN_HÀNG. Đơn hàng sẽ được xác nhận sau khi nhận được tiền.</div>'
        );
      } else {
        $infoBlock.slideUp();
      }
    }
  );

  // Tóm tắt đơn đặt hàng khi kết thúc quá trình mua
  $("#btn-review-order").on("click", function (e) {
    e.preventDefault();

    // Kiểm tra xem trang thanh toán có đủ phần tử không
    if ($("#order-final-summary").length === 0) return;

    // Lấy thông tin đã chọn
    const selectedAddress = $('input[name="address-option"]:checked').val();
    const selectedPayment = $('input[name="payment-method"]:checked').val();

    let addressDetail = "Địa chỉ từ tài khoản đang đăng nhập.";
    if (selectedAddress === "new") {
      // Lấy thông tin từ form
      const name = $("#new-address-form input:eq(0)").val();
      const phone = $("#new-address-form input:eq(1)").val();
      const detail = $("#new-address-detail").val();

      addressDetail = `Địa chỉ mới: <strong>${name}</strong> (${phone}) tại ${detail}`;

      // Nếu chọn địa chỉ mới nhưng chưa nhập, có thể báo lỗi ở đây.
    }

    const subtotalAmount = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const grandTotalAmount = subtotalAmount + SHIPPING_FEE;

    const summaryHtml = `
            <div class="card p-3 mb-3 border-success">
                <h6>Tóm tắt các lựa chọn:</h6>
                <p><strong>Phương thức:</strong> ${
                  selectedPayment === "cash"
                    ? "Thanh toán tiền mặt (COD)"
                    : selectedPayment === "transfer"
                    ? "Chuyển khoản Ngân hàng"
                    : "Thanh toán Trực tuyến"
                }</p>
                <p><strong>Địa chỉ Giao hàng:</strong> ${addressDetail}</p>
                <hr>
                <p>Tổng tiền hàng: ${formatCurrency(subtotalAmount)}</p>
                <p>Phí vận chuyển: Miễn phí</p>
                <h5 class="text-danger">Tổng thanh toán: ${formatCurrency(
                  grandTotalAmount
                )}</h5>
            </div>
        `;

    // Hiển thị tóm tắt và mở nút đặt hàng
    $("#order-final-summary").html(summaryHtml).slideDown();
    $("#btn-place-order")
      .prop("disabled", false)
      .removeClass("btn-secondary")
      .addClass("btn-success");

    $("html, body").animate(
      {
        scrollTop: $("#order-final-summary").offset().top - 100,
      },
      500
    );
  });

  // -----------------------------------------------------------
  // Logic Lịch sử Mua hàng (Dùng cho trang lichsu.php)
  // -----------------------------------------------------------

  // Kiểm tra xem trang hiện tại có bảng lịch sử không
  if ($("#order-history-table").length) {
    renderOrderHistory();
  }

  function renderOrderHistory() {
    // Dữ liệu mô phỏng
    const historyData = [
      {
        id: 12345,
        date: "2025-09-10",
        total: 1200000,
        status: "Đã giao thành công",
      },
      {
        id: 12346,
        date: "2025-10-25",
        total: 850000,
        status: "Đang vận chuyển",
      },
      { id: 12347, date: "2025-11-01", total: 2500000, status: "Đã hủy" },
    ];

    const $historyTableBody = $("#order-history-table tbody");
    $historyTableBody.empty();

    historyData.forEach((order) => {
      let statusClass = "badge-secondary";
      if (order.status.includes("thành công")) statusClass = "badge-success";
      else if (order.status.includes("vận chuyển"))
        statusClass = "badge-primary";
      else if (order.status.includes("hủy")) statusClass = "badge-danger";

      const row = `
                <tr>
                    <td>#${order.id}</td>
                    <td>${order.date}</td>
                    <td>${formatCurrency(order.total)}</td>
                    <td><span class="badge ${statusClass}">${
        order.status
      }</span></td>
                    <td><a href="chitietdonhang.html?id=${
                      order.id
                    }" class="btn btn-sm btn-info">Chi tiết</a></td>
                </tr>
            `;
      $historyTableBody.append(row);
    });
  }
});
