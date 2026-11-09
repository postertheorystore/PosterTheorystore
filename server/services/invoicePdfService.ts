
import PDFDocument from "pdfkit";

type InvoiceRecord = {
  invoice_number: string;
  invoice_date: string;
  invoice_data: any;
};

const money = (value: number) =>
  `Rs. ${Number(value || 0).toFixed(2)}`;

const formatDate = (value: string | Date) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export const generateInvoicePdf = (
  invoice: InvoiceRecord
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: {
          top: 42,
          bottom: 42,
          left: 42,
          right: 42,
        },
        bufferPages: true,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const data = invoice.invoice_data;
      const seller = data.seller;
      const customer = data.customer;
      const order = data.order;

      const pageWidth = doc.page.width;
      const left = 42;
      const right = pageWidth - 42;
      const contentWidth = right - left;

      const black = "#000000";
      const grey = "#666666";

      const drawLine = (y: number) => {
        doc
          .moveTo(left, y)
          .lineTo(right, y)
          .lineWidth(1)
          .strokeColor(black)
          .stroke();
      };

      const drawBox = (
        x: number,
        y: number,
        width: number,
        height: number
      ) => {
        doc
          .rect(x, y, width, height)
          .lineWidth(1.5)
          .strokeColor(black)
          .stroke();
      };

      // Header
      doc
        .font("Helvetica-Bold")
        .fontSize(27)
        .fillColor(black)
        .text("POSTER THEORY", left, 42);

      doc
        .font("Helvetica-Bold")
        .fontSize(17)
        .text("INVOICE", left, 84);

      drawLine(111);

      // Invoice number and date
      drawBox(left, 126, contentWidth, 42);

      doc
        .moveTo(left + contentWidth / 2, 126)
        .lineTo(left + contentWidth / 2, 168)
        .lineWidth(1.5)
        .stroke();

      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("Invoice No.", left + 12, 142, { continued: true });
      doc.font("Helvetica").text(` ${invoice.invoice_number}`);

      doc.font("Helvetica-Bold").text(
        "Date",
        left + contentWidth / 2 + 12,
        142,
        { continued: true }
      );
      doc.font("Helvetica").text(
        ` ${formatDate(invoice.invoice_date)}`
      );

      drawLine(185);

      // Seller and customer information
      const infoY = 201;
      const gap = 14;
      const infoWidth = (contentWidth - gap) / 2;
      const infoHeight = 128;

      drawBox(left, infoY, infoWidth, infoHeight);
      drawBox(left + infoWidth + gap, infoY, infoWidth, infoHeight);

      const sellerX = left + 12;
      const customerX = left + infoWidth + gap + 12;

      doc.font("Helvetica-Bold").fontSize(11);
      doc.text("Seller:", sellerX, infoY + 14);
      doc.text("Bill To:", customerX, infoY + 14);

      doc.font("Helvetica").fontSize(10);

      doc.text(seller.businessName || "Poster Theory", sellerX, infoY + 40);
      doc.text(seller.addressLine1 || "", sellerX, infoY + 62, {
        width: infoWidth - 24,
      });
      doc.text(seller.addressLine2 || "", sellerX, infoY + 78, {
        width: infoWidth - 24,
      });
      doc.text(
        `${seller.city || ""}, ${seller.state || ""} - ${seller.pincode || ""}`,
        sellerX,
        infoY + 96,
        { width: infoWidth - 24 }
      );

      doc.text(customer.name || "Customer", customerX, infoY + 40);
      doc.text(
        [
          customer.address?.line1,
          customer.address?.line2,
          customer.address?.city,
          customer.address?.state,
          customer.address?.pincode,
        ]
          .filter(Boolean)
          .join(", "),
        customerX,
        infoY + 62,
        {
          width: infoWidth - 24,
          height: 30,
          ellipsis: true,
        }
      );

      doc.text(
        `Phone: ${customer.phone || "N/A"}`,
        customerX,
        infoY + 98
      );
      doc.text(
        `Email: ${customer.email || "N/A"}`,
        customerX,
        infoY + 112,
        { width: infoWidth - 24, ellipsis: true }
      );

      drawLine(346);

      // Order and payment details
      const orderY = 363;
      drawBox(left, orderY, contentWidth, 40);

      doc
        .moveTo(left + contentWidth / 2, orderY)
        .lineTo(left + contentWidth / 2, orderY + 40)
        .lineWidth(1.5)
        .stroke();

      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("Order ID", left + 12, orderY + 14, {
        continued: true,
      });
      doc.font("Helvetica").text(` #${order.id}`);

      doc.font("Helvetica-Bold").text(
        "Payment Status",
        left + contentWidth / 2 + 12,
        orderY + 14,
        { continued: true }
      );
      doc.font("Helvetica").text(" PAID");

      drawLine(422);

      // Product table
      const items = Array.isArray(data.items) ? data.items : [];

      const columns = [
        { title: "Product", width: 170 },
        { title: "Size / Details", width: 100 },
        { title: "Qty", width: 45 },
        { title: "Unit Price", width: 90 },
        { title: "Line Total", width: 106 },
        ];

      const tableX = left;
      const tableY = 439;
      const headerHeight = 38;

      const drawTableHeader = (y: number) => {
        doc.rect(tableX, y, contentWidth, headerHeight).fill(black);

        let x = tableX;

        doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");

        columns.forEach((column) => {
          doc.text(column.title, x + 5, y + 13, {
            width: column.width - 10,
            align: column.title === "Product" || column.title === "Size / Details"
              ? "left"
              : "center",
          });
          x += column.width;
        });
      };

      let y = tableY;
      drawTableHeader(y);
      y += headerHeight;

      let merchandiseSubtotal = 0;

      items.forEach((item: any) => {
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.price || 0);
        const lineTotal = quantity * unitPrice;

        merchandiseSubtotal += lineTotal;

        const details = [
          item.size,
          item.customSpecs?.material,
          item.customSpecs?.frame !== "None"
            ? item.customSpecs?.frame
            : null,
          item.isFree || item.promotionFree ? "FREE PROMOTION" : null,
        ]
          .filter(Boolean)
          .join(" / ");

        doc.font("Helvetica").fontSize(9);

        const productHeight = Math.max(
          38,
          doc.heightOfString(String(item.title || "Product"), {
            width: columns[0].width - 12,
          }) + 16
        );

        if (y + productHeight > doc.page.height - 145) {
          doc.addPage();
          y = 42;
          drawTableHeader(y);
          y += headerHeight;
        }

        const rowValues = [
          String(item.title || "Product"),
          details || "Standard",
          String(quantity),
          money(unitPrice),
          money(lineTotal),
        ];

        let x = tableX;

        doc.font("Helvetica").fontSize(9).fillColor(black);

        columns.forEach((column, index) => {
          doc.text(rowValues[index], x + 6, y + 12, {
            width: column.width - 12,
            height: productHeight - 12,
            ellipsis: true,
            align: index === 0 || index === 1 ? "left" : "center",
          });

          x += column.width;
        });

        doc
          .rect(tableX, y, contentWidth, productHeight)
          .lineWidth(1)
          .strokeColor(black)
          .stroke();

        x = tableX;

        columns.slice(0, -1).forEach((column) => {
          x += column.width;
          doc
            .moveTo(x, y)
            .lineTo(x, y + productHeight)
            .lineWidth(1)
            .strokeColor(black)
            .stroke();
        });

        y += productHeight;
      });

      y += 20;

      // Summary
      const couponDiscount = Number(data.couponDiscount || 0);
      const deliveryCharge = Number(data.deliveryCharge || 0);
      const totalPaid = Number(data.total || 0);

      const summaryX = right - 265;
      const summaryWidth = 265;
      const summaryHeight = couponDiscount > 0 ? 140 : 116;

      if (y + summaryHeight > doc.page.height - 45) {
        doc.addPage();
        y = 55;
      }

      drawBox(summaryX, y, summaryWidth, summaryHeight);

      const summaryTextX = summaryX + 12;
      const summaryRight = summaryX + summaryWidth - 12;

      doc.font("Helvetica-Bold").fontSize(11).fillColor(black);
      doc.text("Summary:", summaryTextX, y + 14, {
        width: summaryWidth - 24,
        align: "right",
      });

      const summaryRow = (
        label: string,
        amount: number,
        rowY: number
      ) => {
        doc.font("Helvetica").fontSize(10).fillColor(black);
        doc.text(label, summaryTextX, rowY, {
          width: 165,
        });
        doc.text(money(amount), summaryRight - 80, rowY, {
          width: 80,
          align: "right",
        });
      };

      summaryRow("Merchandise subtotal", merchandiseSubtotal, y + 39);

      let summaryY = y + 60;

      if (couponDiscount > 0) {
        summaryRow("Coupon discount", -couponDiscount, summaryY);
        summaryY += 20;
      }

      summaryRow("Delivery", deliveryCharge, summaryY);

      doc.rect(summaryX + 12, y + summaryHeight - 38, summaryWidth - 24, 26)
        .fill(black);

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#FFFFFF")
        .text(
          `TOTAL PAID  ${money(totalPaid)}`,
          summaryX + 17,
          y + summaryHeight - 31,
          {
            width: summaryWidth - 34,
            align: "right",
          }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
